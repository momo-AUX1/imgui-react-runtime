// Copyright (c) Tzvetan Mikov and contributors
// SPDX-License-Identifier: MIT
// See LICENSE file for full license text

#include "imgui-runtime.h"

#include "sokol_app.h"
#include "sokol_gfx.h"
#include "sokol_glue.h"
#include "sokol_log.h"
#include "sokol_time.h"
#include "stb_image.h"

#include "sokol_imgui.h"
#include "imgui/imgui.h"

// Must be separate to avoid reordering.
#include "sokol_debugtext.h"

#if defined(__APPLE__)
#include <TargetConditionals.h>
#endif

#include <hermes/VM/static_h.h>

#include <cmath>
#include <climits>
#include <filesystem>
#include <fstream>
#include <array>
#include <cstdint>
#include <algorithm>
#include <memory>
#include <cstring>
#include <stdexcept>
#include <mutex>
#include <queue>
#include <thread>
#include <atomic>
#include <cctype>
#include <utility>
#include <string>
#include <string_view>
#include <unordered_map>
#include <vector>
#include <chrono>
#include <cstdlib>
#include <sstream>
#include <system_error>

#if !defined(_WIN32)
#include <sys/utsname.h>
#include <unistd.h>
#endif

#include <curl/curl.h>

namespace fs = std::filesystem;

#if defined(__APPLE__) || defined(__linux__) || defined(__unix__) ||          \
  defined(__EMSCRIPTEN__) || defined(__ANDROID__)
extern char **environ;
#endif

// Hermes runtime and event loop management
class HermesApp {
public:
  std::unique_ptr<SHRuntime, decltype(&_sh_done)> shRuntime;
  facebook::hermes::HermesRuntime *hermes = nullptr;
  facebook::jsi::Function peekMacroTask;
  facebook::jsi::Function runMacroTask;

  HermesApp(SHRuntime *shr, facebook::jsi::Function &&peek,
            facebook::jsi::Function &&run)
      : shRuntime(shr, &_sh_done), hermes(_sh_get_hermes_runtime(shr)),
        peekMacroTask(std::move(peek)), runMacroTask(std::move(run)) {}

  // Delete copy/move to ensure singleton behavior
  HermesApp(const HermesApp &) = delete;
  HermesApp &operator=(const HermesApp &) = delete;
  HermesApp(HermesApp &&) = delete;
  HermesApp &operator=(HermesApp &&) = delete;
};

static HermesApp *s_hermesApp = nullptr;

static sg_sampler s_sampler = {};
static bool s_navKeyboardEnabled = true;
static bool s_navGamepadEnabled = true;
static double s_runtimeStartMs = 0.0;

static void apply_navigation_config() {
  if (ImGui::GetCurrentContext() == nullptr) {
    return;
  }

  ImGuiIO &io = ImGui::GetIO();

  if (s_navKeyboardEnabled) {
    io.ConfigFlags |= ImGuiConfigFlags_NavEnableKeyboard;
  } else {
    io.ConfigFlags &= ~ImGuiConfigFlags_NavEnableKeyboard;
  }

  if (s_navGamepadEnabled) {
    io.ConfigFlags |= ImGuiConfigFlags_NavEnableGamepad;
  } else {
    io.ConfigFlags &= ~ImGuiConfigFlags_NavEnableGamepad;
  }
}

static void update_navigation_state_js(facebook::jsi::Runtime &runtime) {
  try {
    auto global = runtime.global();
    if (!global.hasProperty(runtime, "__setNavigationState")) {
      return;
    }
    auto setter = global.getPropertyAsFunction(runtime, "__setNavigationState");
    setter.call(runtime, s_navKeyboardEnabled, s_navGamepadEnabled);
  } catch (...) {
    // Ignore synchronization errors to avoid disrupting rendering.
  }
}

static facebook::jsi::Value
configure_navigation_host(facebook::jsi::Runtime &runtime,
                          const facebook::jsi::Value &,
                          const facebook::jsi::Value *args, size_t count) {
  bool keyboard = s_navKeyboardEnabled;
  bool gamepad = s_navGamepadEnabled;

  if (count >= 1) {
    const auto &first = args[0];
    if (first.isObject() && !first.isNull()) {
      auto obj = first.asObject(runtime);
      if (obj.hasProperty(runtime, "keyboard")) {
        auto value = obj.getProperty(runtime, "keyboard");
        if (value.isBool()) {
          keyboard = value.getBool();
        } else if (value.isNumber()) {
          keyboard = value.getNumber() != 0.0;
        }
      }
      if (obj.hasProperty(runtime, "gamepad")) {
        auto value = obj.getProperty(runtime, "gamepad");
        if (value.isBool()) {
          gamepad = value.getBool();
        } else if (value.isNumber()) {
          gamepad = value.getNumber() != 0.0;
        }
      }
    } else if (first.isBool()) {
      keyboard = first.getBool();
    } else if (first.isNumber()) {
      keyboard = first.getNumber() != 0.0;
    }
  }

  if (count >= 2) {
    const auto &second = args[1];
    if (second.isBool()) {
      gamepad = second.getBool();
    } else if (second.isNumber()) {
      gamepad = second.getNumber() != 0.0;
    }
  }

  s_navKeyboardEnabled = keyboard;
  s_navGamepadEnabled = gamepad;

  apply_navigation_config();
  update_navigation_state_js(runtime);

  return facebook::jsi::Value::undefined();
}

struct PlatformInfo {
  std::string os;
  bool ios = false;
  bool android = false;
  bool macos = false;
  bool windows = false;
  bool linux = false;
  bool web = false;
  bool isNative = false;
  bool isDesktop = false;
  bool isMobile = false;
  bool isTV = false;
  double version = 0;
};

static PlatformInfo detect_platform_info() {
  PlatformInfo info;

#if defined(__EMSCRIPTEN__)
  info.os = "web";
  info.web = true;
  info.isNative = false;
  info.isDesktop = false;
  info.isMobile = false;
#elif defined(__ANDROID__)
  info.os = "android";
  info.android = true;
  info.isNative = true;
  info.isMobile = true;
#elif defined(__APPLE__)
#if defined(TARGET_OS_TV) && TARGET_OS_TV
  info.os = "ios";
  info.ios = true;
  info.isNative = true;
  info.isTV = true;
  info.isMobile = true;
#elif defined(TARGET_OS_IPHONE) && TARGET_OS_IPHONE
  info.os = "ios";
  info.ios = true;
  info.isNative = true;
  info.isMobile = true;
#else
  info.os = "macos";
  info.macos = true;
  info.isNative = true;
  info.isDesktop = true;
#endif
#elif defined(_WIN32)
  info.os = "windows";
  info.windows = true;
  info.isNative = true;
  info.isDesktop = true;
#elif defined(__linux__)
  info.os = "linux";
  info.linux = true;
  info.isNative = true;
  info.isDesktop = true;
#else
  info.os = "unknown";
  info.isNative = true;
#endif

  if (info.os.empty()) {
    info.os = "unknown";
  }

  if (!info.isDesktop && info.isNative && !info.isMobile && !info.isTV) {
    info.isDesktop = true;
  }

  return info;
}

static void push_platform_info_to_js(facebook::hermes::HermesRuntime *hermes,
                                     const PlatformInfo &info) {
  if (!hermes) {
    return;
  }

  try {
    auto global = hermes->global();
    if (!global.hasProperty(*hermes, "__setPlatformInfo")) {
      return;
    }

    facebook::jsi::Object payload(*hermes);
    payload.setProperty(
        *hermes, "os",
        facebook::jsi::String::createFromUtf8(*hermes, info.os));
    payload.setProperty(*hermes, "ios", facebook::jsi::Value(info.ios));
    payload.setProperty(*hermes, "android",
                        facebook::jsi::Value(info.android));
    payload.setProperty(*hermes, "macos", facebook::jsi::Value(info.macos));
    payload.setProperty(*hermes, "windows",
                        facebook::jsi::Value(info.windows));
    payload.setProperty(*hermes, "linux", facebook::jsi::Value(info.linux));
    payload.setProperty(*hermes, "web", facebook::jsi::Value(info.web));
    payload.setProperty(*hermes, "isNative",
                        facebook::jsi::Value(info.isNative));
    payload.setProperty(*hermes, "isWeb", facebook::jsi::Value(info.web));
    payload.setProperty(*hermes, "isDesktop",
                        facebook::jsi::Value(info.isDesktop));
    payload.setProperty(*hermes, "isMobile",
                        facebook::jsi::Value(info.isMobile));
    payload.setProperty(*hermes, "isTV", facebook::jsi::Value(info.isTV));
    payload.setProperty(*hermes, "version",
                        facebook::jsi::Value(info.version));

    global.getPropertyAsFunction(*hermes, "__setPlatformInfo")
        .call(*hermes, std::move(payload));
  } catch (const facebook::jsi::JSIException &error) {
    slog_func("ERROR", 1, 0, error.what(), __LINE__, __FILE__, nullptr);
  } catch (const std::exception &error) {
    slog_func("ERROR", 1, 0, error.what(), __LINE__, __FILE__, nullptr);
  }
}

static int s_lastWindowWidth = -1;
static int s_lastWindowHeight = -1;
static float s_lastDpiScale = 0.0f;
static float s_lastFontScale = 0.0f;

static void push_window_metrics_to_js() {
  if (!s_hermesApp || !s_hermesApp->hermes) {
    return;
  }

  int width = sapp_width();
  int height = sapp_height();
  float dpiScale = sapp_dpi_scale();
  float fontScale = dpiScale;

  if (width == s_lastWindowWidth && height == s_lastWindowHeight &&
      std::fabs(dpiScale - s_lastDpiScale) < 0.001f &&
      std::fabs(fontScale - s_lastFontScale) < 0.001f) {
    return;
  }

  s_lastWindowWidth = width;
  s_lastWindowHeight = height;
  s_lastDpiScale = dpiScale;
  s_lastFontScale = fontScale;

  try {
    auto global = s_hermesApp->hermes->global();
    if (!global.hasProperty(*s_hermesApp->hermes, "__setWindowMetrics")) {
      return;
    }

    global.getPropertyAsFunction(*s_hermesApp->hermes, "__setWindowMetrics")
        .call(*s_hermesApp->hermes, (double)width, (double)height,
              (double)dpiScale, (double)fontScale);
  } catch (const facebook::jsi::JSIException &error) {
    slog_func("ERROR", 1, 0, error.what(), __LINE__, __FILE__, nullptr);
  } catch (const std::exception &error) {
    slog_func("ERROR", 1, 0, error.what(), __LINE__, __FILE__, nullptr);
  }
}

namespace {

struct EmbeddedImage {
  const unsigned char *data;
  unsigned size;
};

static std::unordered_map<std::string, EmbeddedImage> &embedded_images() {
  static std::unordered_map<std::string, EmbeddedImage> images;
  return images;
}

const EmbeddedImage *find_embedded_image(std::string_view key) {
  if (key.empty()) {
    return nullptr;
  }

  auto &images = embedded_images();

  const auto direct = images.find(std::string(key));
  if (direct != images.end()) {
    return &direct->second;
  }

  // Strip leading "./" which is common in JS configuration strings.
  if (key.size() > 2 && key[0] == '.' && (key[1] == '/' || key[1] == '\\')) {
    const auto withoutDot = images.find(std::string(key.substr(2)));
    if (withoutDot != images.end()) {
      return &withoutDot->second;
    }
  }

  // Try matching by filename component only.
  std::filesystem::path asPath{std::string(key)};
  auto filename = asPath.filename().string();
  if (!filename.empty()) {
    const auto byName = images.find(filename);
    if (byName != images.end()) {
      return &byName->second;
    }
  }

  return nullptr;
}

} // namespace

struct NativeFetchRequest {
  int id = 0;
  std::string url;
  std::string method = "GET";
  std::vector<std::pair<std::string, std::string>> headers;
  std::string body;
  bool hasBody = false;
  long timeoutMs = -1;
  bool followRedirects = true;
};

struct NativeFetchResult {
  int id = 0;
  bool ok = false;
  int status = 0;
  std::string statusText;
  std::string url;
  std::string errorMessage;
  std::vector<std::pair<std::string, std::string>> headers;
  std::string bodyBase64;
};

static std::atomic<int> s_nextFetchRequestId{1};
static std::mutex s_fetchQueueMutex;
static std::queue<NativeFetchResult> s_completedFetches;

static const char kBase64Alphabet[] =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

static inline char encodeBase64Char(unsigned char value) {
  return kBase64Alphabet[value & 0x3F];
}

static std::string base64Encode(const std::vector<unsigned char> &input) {
  if (input.empty()) {
    return {};
  }

  std::string encoded;
  encoded.reserve(((input.size() + 2) / 3) * 4);

  size_t i = 0;
  while (i + 2 < input.size()) {
    unsigned int triple = (input[i] << 16) | (input[i + 1] << 8) | input[i + 2];
    encoded.push_back(encodeBase64Char((triple >> 18) & 0x3F));
    encoded.push_back(encodeBase64Char((triple >> 12) & 0x3F));
    encoded.push_back(encodeBase64Char((triple >> 6) & 0x3F));
    encoded.push_back(encodeBase64Char(triple & 0x3F));
    i += 3;
  }

  if (i < input.size()) {
    unsigned int triple = input[i] << 16;
    encoded.push_back(encodeBase64Char((triple >> 18) & 0x3F));
    if (i + 1 < input.size()) {
      triple |= input[i + 1] << 8;
      encoded.push_back(encodeBase64Char((triple >> 12) & 0x3F));
      encoded.push_back(encodeBase64Char((triple >> 6) & 0x3F));
      encoded.push_back('=');
    } else {
      encoded.push_back(encodeBase64Char((triple >> 12) & 0x3F));
      encoded.push_back('=');
      encoded.push_back('=');
    }
  }

  return encoded;
}

static std::vector<unsigned char>
base64Decode(const std::string &input) {
  if (input.empty()) {
    return {};
  }

    static const std::array<int, 256> kDecodeTable = []() {
      std::array<int, 256> table{};
      table.fill(-1);
      for (int i = 0; i < 64; ++i) {
        table[static_cast<unsigned char>(kBase64Alphabet[i])] = i;
      }
      table[static_cast<unsigned char>('=')] = 0;
      return table;
    }();

  std::vector<unsigned char> output;
  output.reserve((input.size() * 3) / 4);

  int accumulator = 0;
  int bits = 0;
  int padding = 0;

  for (unsigned char ch : input) {
    if (ch == '=') {
      ++padding;
      accumulator <<= 6;
      bits += 6;
    } else {
  int value = kDecodeTable[static_cast<unsigned char>(ch)];
      if (value < 0) {
        if (ch == '\r' || ch == '\n' || ch == ' ' || ch == '\t') {
          continue;
        }
        throw std::runtime_error("Invalid base64 input");
      }
      accumulator = (accumulator << 6) | value;
      bits += 6;
    }

    if (bits >= 8) {
      bits -= 8;
      unsigned char byte = static_cast<unsigned char>((accumulator >> bits) & 0xFF);
      output.push_back(byte);
    }
  }

  if (padding) {
    if (static_cast<size_t>(padding) > output.size()) {
      throw std::runtime_error("Invalid base64 padding");
    }
    output.resize(output.size() - padding);
  }

  return output;
}

namespace nodecompat {

enum class FsEntryType : int {
  None = 0,
  File = 1,
  Directory = 2,
  Symlink = 3,
  Other = 4
};

static double fileTimeToMilliseconds(const fs::file_time_type &timePoint) {
  using namespace std::chrono;
  if (timePoint == fs::file_time_type::min()) {
    return 0.0;
  }

  auto systemNow = system_clock::now();
  auto adjusted = timePoint - fs::file_time_type::clock::now() + systemNow;
  auto millis = time_point_cast<milliseconds>(adjusted);
  return static_cast<double>(millis.time_since_epoch().count());
}

struct StatInfo {
  FsEntryType type = FsEntryType::None;
  bool exists = false;
  uintmax_t size = 0;
  double mtimeMs = 0.0;
  double ctimeMs = 0.0;
  uint32_t mode = 0;
};

static StatInfo getStatInfo(const fs::path &target, bool followSymlinks) {
  StatInfo info;
  std::error_code ec;
  auto status = followSymlinks ? fs::status(target, ec)
                               : fs::symlink_status(target, ec);
  if (ec) {
    return info;
  }

  info.exists = fs::exists(status);
  if (!info.exists) {
    return info;
  }

  if (fs::is_regular_file(status)) {
    info.type = FsEntryType::File;
  } else if (fs::is_directory(status)) {
    info.type = FsEntryType::Directory;
  } else if (fs::is_symlink(status)) {
    info.type = FsEntryType::Symlink;
  } else {
    info.type = FsEntryType::Other;
  }

  if (info.type == FsEntryType::File) {
    info.size = fs::file_size(target, ec);
    if (ec) {
      info.size = 0;
    }
  }

  auto mtime = fs::last_write_time(target, ec);
  if (!ec) {
    info.mtimeMs = fileTimeToMilliseconds(mtime);
  }
  info.ctimeMs = info.mtimeMs;

  info.mode = static_cast<uint32_t>(status.permissions());
  return info;
}

static std::vector<unsigned char> readFileBytes(const fs::path &target) {
  std::ifstream stream(target, std::ios::binary);
  if (!stream) {
    throw std::runtime_error("Failed to open file for reading: " +
                             target.string());
  }

  stream.seekg(0, std::ios::end);
  std::streampos length = stream.tellg();
  if (length < 0) {
    throw std::runtime_error("Failed to determine file size: " +
                             target.string());
  }

  std::vector<unsigned char> data(static_cast<size_t>(length));
  stream.seekg(0, std::ios::beg);
  if (length > 0) {
    stream.read(reinterpret_cast<char *>(data.data()), length);
    if (!stream) {
      throw std::runtime_error("Failed to read file: " + target.string());
    }
  }

  return data;
}

static void writeFileBytes(const fs::path &target,
                           const std::vector<unsigned char> &bytes,
                           bool append) {
  auto mode = std::ios::binary | (append ? std::ios::app : std::ios::trunc);
  std::ofstream stream(target, mode);
  if (!stream) {
    throw std::runtime_error("Failed to open file for writing: " +
                             target.string());
  }

  if (!bytes.empty()) {
    stream.write(reinterpret_cast<const char *>(bytes.data()),
                 static_cast<std::streamsize>(bytes.size()));
  }

  if (!stream) {
    throw std::runtime_error("Failed to write file: " + target.string());
  }
}

static std::string detectArchitecture() {
#if defined(__EMSCRIPTEN__)
  return "wasm32";
#elif defined(__aarch64__) || defined(_M_ARM64)
  return "arm64";
#elif defined(__arm__) || defined(_M_ARM)
  return "arm";
#elif defined(__x86_64__) || defined(_M_X64)
  return "x64";
#elif defined(__i386__) || defined(_M_IX86)
  return "ia32";
#else
  return "unknown";
#endif
}

static std::string getTempDirectory() {
  std::error_code ec;
  auto path = fs::temp_directory_path(ec);
  if (ec) {
    return {};
  }
  return path.string();
}

static std::string getHomeDirectory() {
#if defined(_WIN32)
  const char *home = std::getenv("USERPROFILE");
  if (home && home[0]) {
    return home;
  }
  const char *drive = std::getenv("HOMEDRIVE");
  const char *path = std::getenv("HOMEPATH");
  if (drive && path) {
    return std::string(drive) + path;
  }
  return {};
#else
  const char *home = std::getenv("HOME");
  if (home && home[0]) {
    return home;
  }
  return {};
#endif
}

static std::string getHostName() {
#if defined(_WIN32)
  return {};
#else
  char buffer[256];
  if (gethostname(buffer, sizeof(buffer)) == 0) {
    buffer[sizeof(buffer) - 1] = '\0';
    return buffer;
  }
  return {};
#endif
}

static std::string getOsRelease() {
#if defined(__unix__) || defined(__APPLE__) || defined(__EMSCRIPTEN__) ||    \
    defined(__ANDROID__)
  struct utsname name {};
  if (uname(&name) == 0) {
    return name.release;
  }
  return {};
#else
  return {};
#endif
}

static std::string getEndianness() {
  uint16_t value = 0x0102;
  unsigned char first =
      *reinterpret_cast<unsigned char *>(static_cast<void *>(&value));
  return first == 0x01 ? "BE" : "LE";
}

static double getTotalMemory() {
#if defined(_SC_PHYS_PAGES) && defined(_SC_PAGE_SIZE)
  long pages = sysconf(_SC_PHYS_PAGES);
  long pageSize = sysconf(_SC_PAGE_SIZE);
  if (pages > 0 && pageSize > 0) {
    return static_cast<double>(pages) * static_cast<double>(pageSize);
  }
#endif
  return 0.0;
}

static double getFreeMemory() {
#if defined(_SC_AVPHYS_PAGES) && defined(_SC_PAGE_SIZE)
  long pages = sysconf(_SC_AVPHYS_PAGES);
  long pageSize = sysconf(_SC_PAGE_SIZE);
  if (pages > 0 && pageSize > 0) {
    return static_cast<double>(pages) * static_cast<double>(pageSize);
  }
#endif
  return 0.0;
}

static std::string getUserName() {
#if defined(_WIN32)
  const char *user = std::getenv("USERNAME");
#else
  const char *user = std::getenv("USER");
#endif
  if (user && user[0]) {
    return user;
  }
  return {};
}

static std::string getUserShell() {
#if defined(_WIN32)
  const char *shell = std::getenv("COMSPEC");
#else
  const char *shell = std::getenv("SHELL");
#endif
  if (shell && shell[0]) {
    return shell;
  }
  return {};
}

static std::vector<double> getLoadAverage() { return {0.0, 0.0, 0.0}; }

static double getUptimeSeconds() {
  if (s_runtimeStartMs <= 0.0) {
    return 0.0;
  }
  double nowMs = stm_ms(stm_now());
  return std::max(0.0, (nowMs - s_runtimeStartMs) / 1000.0);
}

static facebook::jsi::Object readEnvironment(facebook::jsi::Runtime &runtime) {
  facebook::jsi::Object env(runtime);

#if defined(__APPLE__) || defined(__linux__) || defined(__unix__) ||          \
    defined(__EMSCRIPTEN__) || defined(__ANDROID__)
  if (!::environ) {
    return env;
  }
  for (char **entry = ::environ; *entry; ++entry) {
    const char *raw = *entry;
    const char *separator = std::strchr(raw, '=');
    if (!separator || separator == raw) {
      continue;
    }
    std::string key(raw, separator - raw);
    std::string value(separator + 1);
    env.setProperty(runtime, key.c_str(),
                    facebook::jsi::String::createFromUtf8(runtime, value));
  }
#else
  const char *pathEnv = std::getenv("PATH");
  if (pathEnv) {
    env.setProperty(runtime, "PATH",
                    facebook::jsi::String::createFromUtf8(runtime, pathEnv));
  }
  const char *homeEnv = std::getenv("HOME");
  if (homeEnv) {
    env.setProperty(runtime, "HOME",
                    facebook::jsi::String::createFromUtf8(runtime, homeEnv));
  }
#endif

  return env;
}

static std::string toLowerAscii(std::string value) {
  for (char &ch : value) {
    ch = static_cast<char>(std::tolower(static_cast<unsigned char>(ch)));
  }
  return value;
}

static facebook::jsi::Object makeStatObject(facebook::jsi::Runtime &runtime,
                      StatInfo info) {
  auto infoPtr = std::make_shared<StatInfo>(std::move(info));
  facebook::jsi::Object stat(runtime);
  auto makePredicate = [&runtime, infoPtr](const char *name,
                       FsEntryType expected) {
  auto predicate = [infoPtr, expected](facebook::jsi::Runtime &,
                     const facebook::jsi::Value &,
                     const facebook::jsi::Value *,
                     size_t) -> facebook::jsi::Value {
    return facebook::jsi::Value(infoPtr->type == expected);
  };
  return facebook::jsi::Function::createFromHostFunction(
    runtime, facebook::jsi::PropNameID::forAscii(runtime, name), 0,
    predicate);
  };

  stat.setProperty(runtime, "isFile",
           makePredicate("isFile", FsEntryType::File));
  stat.setProperty(runtime, "isDirectory",
           makePredicate("isDirectory", FsEntryType::Directory));
  stat.setProperty(runtime, "isSymbolicLink",
           makePredicate("isSymbolicLink", FsEntryType::Symlink));
  stat.setProperty(runtime, "size",
           facebook::jsi::Value(static_cast<double>(infoPtr->size)));
  stat.setProperty(runtime, "mtimeMs",
           facebook::jsi::Value(infoPtr->mtimeMs));
  stat.setProperty(runtime, "ctimeMs",
           facebook::jsi::Value(infoPtr->ctimeMs));
  stat.setProperty(runtime, "mode",
           facebook::jsi::Value(static_cast<double>(infoPtr->mode)));
  stat.setProperty(runtime, "exists",
           facebook::jsi::Value(infoPtr->exists));
  stat.setProperty(runtime, "type",
           facebook::jsi::Value(static_cast<int>(infoPtr->type)));
  return stat;
}

static facebook::jsi::Object makeOsInfo(facebook::jsi::Runtime &runtime,
                    const PlatformInfo &platform) {
  facebook::jsi::Object os(runtime);
  os.setProperty(runtime, "platform",
         facebook::jsi::String::createFromUtf8(runtime, platform.os));
  os.setProperty(runtime, "arch",
         facebook::jsi::String::createFromUtf8(
           runtime, detectArchitecture()));
  os.setProperty(runtime, "release",
         facebook::jsi::String::createFromUtf8(runtime,
                             getOsRelease()));
  os.setProperty(runtime, "endianness",
         facebook::jsi::Function::createFromHostFunction(
           runtime,
           facebook::jsi::PropNameID::forAscii(runtime,
                              "endianness"),
           0, [](facebook::jsi::Runtime &rt,
               const facebook::jsi::Value &,
               const facebook::jsi::Value *,
               size_t) -> facebook::jsi::Value {
             return facebook::jsi::String::createFromUtf8(
               rt, getEndianness());
           }));
  os.setProperty(runtime, "totalmem",
         facebook::jsi::Function::createFromHostFunction(
           runtime,
           facebook::jsi::PropNameID::forAscii(runtime, "totalmem"),
           0, [](facebook::jsi::Runtime &rt,
               const facebook::jsi::Value &,
               const facebook::jsi::Value *,
               size_t) -> facebook::jsi::Value {
             return facebook::jsi::Value(getTotalMemory());
           }));
  os.setProperty(runtime, "freemem",
         facebook::jsi::Function::createFromHostFunction(
           runtime,
           facebook::jsi::PropNameID::forAscii(runtime, "freemem"),
           0, [](facebook::jsi::Runtime &rt,
               const facebook::jsi::Value &,
               const facebook::jsi::Value *,
               size_t) -> facebook::jsi::Value {
             return facebook::jsi::Value(getFreeMemory());
           }));
  os.setProperty(runtime, "uptime",
         facebook::jsi::Function::createFromHostFunction(
           runtime,
           facebook::jsi::PropNameID::forAscii(runtime, "uptime"),
           0, [](facebook::jsi::Runtime &rt,
               const facebook::jsi::Value &,
               const facebook::jsi::Value *,
               size_t) -> facebook::jsi::Value {
             return facebook::jsi::Value(getUptimeSeconds());
           }));
  os.setProperty(runtime, "tmpdir",
         facebook::jsi::Function::createFromHostFunction(
           runtime,
           facebook::jsi::PropNameID::forAscii(runtime, "tmpdir"),
           0, [](facebook::jsi::Runtime &rt,
               const facebook::jsi::Value &,
               const facebook::jsi::Value *,
               size_t) -> facebook::jsi::Value {
             return facebook::jsi::String::createFromUtf8(
               rt, getTempDirectory());
           }));
  os.setProperty(runtime, "homedir",
         facebook::jsi::Function::createFromHostFunction(
           runtime,
           facebook::jsi::PropNameID::forAscii(runtime, "homedir"),
           0, [](facebook::jsi::Runtime &rt,
               const facebook::jsi::Value &,
               const facebook::jsi::Value *,
               size_t) -> facebook::jsi::Value {
             return facebook::jsi::String::createFromUtf8(
               rt, getHomeDirectory());
           }));
  os.setProperty(runtime, "hostname",
         facebook::jsi::Function::createFromHostFunction(
           runtime,
           facebook::jsi::PropNameID::forAscii(runtime, "hostname"),
           0, [](facebook::jsi::Runtime &rt,
               const facebook::jsi::Value &,
               const facebook::jsi::Value *,
               size_t) -> facebook::jsi::Value {
             return facebook::jsi::String::createFromUtf8(
               rt, getHostName());
           }));
  os.setProperty(runtime, "type",
         facebook::jsi::Function::createFromHostFunction(
           runtime,
           facebook::jsi::PropNameID::forAscii(runtime, "type"), 0,
           [platform](facebook::jsi::Runtime &rt,
                const facebook::jsi::Value &,
                const facebook::jsi::Value *,
                size_t) -> facebook::jsi::Value {
             return facebook::jsi::String::createFromUtf8(
               rt, platform.os);
           }));
  os.setProperty(runtime, "userInfo",
                 facebook::jsi::Function::createFromHostFunction(
                     runtime,
                     facebook::jsi::PropNameID::forAscii(runtime, "userInfo"),
                     0, [](facebook::jsi::Runtime &rt,
                           const facebook::jsi::Value &,
                           const facebook::jsi::Value *,
                           size_t) -> facebook::jsi::Value {
                       facebook::jsi::Object info(rt);
                       info.setProperty(rt, "username",
                                        facebook::jsi::String::createFromUtf8(
                                            rt, getUserName()));
                       info.setProperty(rt, "homedir",
                                        facebook::jsi::String::createFromUtf8(
                                            rt, getHomeDirectory()));
                       info.setProperty(rt, "shell",
                                        facebook::jsi::String::createFromUtf8(
                                            rt, getUserShell()));
                       return info;
                     }));
  os.setProperty(runtime, "loadavg",
                 facebook::jsi::Function::createFromHostFunction(
                     runtime,
                     facebook::jsi::PropNameID::forAscii(runtime, "loadavg"),
                     0, [](facebook::jsi::Runtime &rt,
                           const facebook::jsi::Value &,
                           const facebook::jsi::Value *,
                           size_t) -> facebook::jsi::Value {
                       auto loads = getLoadAverage();
                       facebook::jsi::Array arr(rt, loads.size());
                       for (size_t i = 0; i < loads.size(); ++i) {
                         arr.setValueAtIndex(rt, i,
                                             facebook::jsi::Value(loads[i]));
                       }
                       return arr;
                     }));
  os.setProperty(runtime, "EOL",
                 facebook::jsi::String::createFromUtf8(runtime,
                                                       platform.windows
                                                           ? "\r\n"
                                                           : "\n"));
  os.setProperty(runtime, "release",
                 facebook::jsi::Function::createFromHostFunction(
                     runtime,
                     facebook::jsi::PropNameID::forAscii(runtime, "release"),
                     0, [](facebook::jsi::Runtime &rt,
                           const facebook::jsi::Value &,
                           const facebook::jsi::Value *,
                           size_t) -> facebook::jsi::Value {
                       return facebook::jsi::String::createFromUtf8(
                           rt, getOsRelease());
                     }));
  os.setProperty(runtime, "constants", facebook::jsi::Object(runtime));
  return os;
}

static facebook::jsi::Value
convertVectorOfStrings(facebook::jsi::Runtime &runtime,
                       const std::vector<std::string> &items) {
  facebook::jsi::Array array(runtime, items.size());
  for (size_t i = 0; i < items.size(); ++i) {
    array.setValueAtIndex(runtime, i,
                          facebook::jsi::String::createFromUtf8(runtime,
                                                                 items[i]));
  }
  return array;
}

static void installFsBindings(facebook::jsi::Runtime &runtime) {
  facebook::jsi::Object native(runtime);

  auto statHost = facebook::jsi::Function::createFromHostFunction(
      runtime, facebook::jsi::PropNameID::forAscii(runtime, "stat"), 2,
      [](facebook::jsi::Runtime &rt, const facebook::jsi::Value &,
         const facebook::jsi::Value *args,
         size_t count) -> facebook::jsi::Value {
        if (count < 1 || !args[0].isString()) {
          throw facebook::jsi::JSError(rt,
                                      "fs.stat requires a string path");
        }

        std::string pathStr = args[0].asString(rt).utf8(rt);
        bool followSymlinks = true;
        if (count >= 2 && args[1].isObject()) {
          auto opts = args[1].asObject(rt);
          if (opts.hasProperty(rt, "followSymbolicLinks")) {
            auto value = opts.getProperty(rt, "followSymbolicLinks");
            if (value.isBool()) {
              followSymlinks = value.getBool();
            }
          }
        }

        fs::path target(pathStr);
        try {
          auto info = getStatInfo(target, followSymlinks);
          if (!info.exists) {
            throw facebook::jsi::JSError(rt, "ENOENT: no such file or directory");
          }
          return makeStatObject(rt, std::move(info));
        } catch (const std::exception &error) {
          throw facebook::jsi::JSError(rt, error.what());
        }
      });

  native.setProperty(runtime, "stat", statHost);
  native.setProperty(runtime, "lstat",
                     facebook::jsi::Function::createFromHostFunction(
                         runtime,
                         facebook::jsi::PropNameID::forAscii(runtime, "lstat"),
                         1, [](facebook::jsi::Runtime &rt,
                               const facebook::jsi::Value &,
                               const facebook::jsi::Value *args,
                               size_t count) -> facebook::jsi::Value {
                           if (count < 1 || !args[0].isString()) {
                             throw facebook::jsi::JSError(rt,
                                                          "fs.lstat requires a path");
                           }
                           fs::path target(args[0].asString(rt).utf8(rt));
                           try {
                             auto info = getStatInfo(target, false);
                             if (!info.exists) {
                               throw facebook::jsi::JSError(
                                   rt, "ENOENT: no such file or directory");
                             }
                             return makeStatObject(rt, std::move(info));
                           } catch (const std::exception &error) {
                             throw facebook::jsi::JSError(rt, error.what());
                           }
                         }));

  native.setProperty(runtime, "exists", facebook::jsi::Function::createFromHostFunction(
                                    runtime, facebook::jsi::PropNameID::forAscii(runtime, "exists"), 1,
                                    [](facebook::jsi::Runtime &rt, const facebook::jsi::Value &,
                                       const facebook::jsi::Value *args,
                                       size_t count) -> facebook::jsi::Value {
                                      if (count < 1 || !args[0].isString()) {
                                        return facebook::jsi::Value(false);
                                      }
                                      fs::path target(args[0].asString(rt).utf8(rt));
                                      std::error_code ec;
                                      auto exists = fs::exists(target, ec);
                                      return facebook::jsi::Value(exists && !ec);
                                    }));

  native.setProperty(runtime, "readdir",
                     facebook::jsi::Function::createFromHostFunction(
                         runtime,
                         facebook::jsi::PropNameID::forAscii(runtime, "readdir"),
                         1, [](facebook::jsi::Runtime &rt,
                               const facebook::jsi::Value &,
                               const facebook::jsi::Value *args,
                               size_t count) -> facebook::jsi::Value {
                           if (count < 1 || !args[0].isString()) {
                             throw facebook::jsi::JSError(
                                 rt, "fs.readdir requires a path");
                           }
                           fs::path directory(args[0].asString(rt).utf8(rt));
                           std::vector<std::string> entries;
                           std::error_code ec;
                           for (const auto &entry :
                                fs::directory_iterator(directory, ec)) {
                             entries.emplace_back(entry.path().filename().string());
                           }
                           if (ec) {
                             throw facebook::jsi::JSError(rt, ec.message());
                           }
                           return convertVectorOfStrings(rt, entries);
                         }));

  native.setProperty(runtime, "readFile",
                     facebook::jsi::Function::createFromHostFunction(
                         runtime,
                         facebook::jsi::PropNameID::forAscii(runtime, "readFile"),
                         2, [](facebook::jsi::Runtime &rt,
                               const facebook::jsi::Value &,
                               const facebook::jsi::Value *args,
                               size_t count) -> facebook::jsi::Value {
                           if (count < 1 || !args[0].isString()) {
                             throw facebook::jsi::JSError(
                                 rt, "fs.readFile requires a path");
                           }
                           fs::path target(args[0].asString(rt).utf8(rt));
                           std::string encoding = "base64";
                           if (count >= 2 && args[1].isString()) {
                             encoding = toLowerAscii(
                                 args[1].asString(rt).utf8(rt));
                           }

                           try {
                             auto bytes = readFileBytes(target);
                             if (encoding == "utf8" || encoding == "utf-8") {
                               std::string text(bytes.begin(), bytes.end());
                               return facebook::jsi::String::createFromUtf8(rt,
                                                                            text);
                             }
                             std::string base64 = base64Encode(bytes);
                             return facebook::jsi::String::createFromUtf8(
                                 rt, base64);
                           } catch (const std::exception &error) {
                             throw facebook::jsi::JSError(rt, error.what());
                           }
                         }));

  native.setProperty(runtime, "writeFile",
                     facebook::jsi::Function::createFromHostFunction(
                         runtime,
                         facebook::jsi::PropNameID::forAscii(runtime, "writeFile"),
                         3, [](facebook::jsi::Runtime &rt,
                               const facebook::jsi::Value &,
                               const facebook::jsi::Value *args,
                               size_t count) -> facebook::jsi::Value {
                           if (count < 2 || !args[0].isString() ||
                               !args[1].isString()) {
                             throw facebook::jsi::JSError(
                                 rt, "fs.writeFile requires path and data");
                           }
                           fs::path target(args[0].asString(rt).utf8(rt));
                           std::string data = args[1].asString(rt).utf8(rt);
                           std::string encoding = "utf8";
                           bool append = false;
                           if (count >= 3) {
                             const auto &third = args[2];
                             if (third.isString()) {
                               encoding = toLowerAscii(
                                   third.asString(rt).utf8(rt));
                             } else if (third.isObject()) {
                               auto opts = third.asObject(rt);
                               if (opts.hasProperty(rt, "encoding")) {
                                 encoding = toLowerAscii(
                                     opts.getProperty(rt, "encoding")
                                         .toString(rt)
                                         .utf8(rt));
                               }
                               if (opts.hasProperty(rt, "flag")) {
                                 auto flag = opts.getProperty(rt, "flag")
                                                  .toString(rt)
                                                  .utf8(rt);
                                 if (flag == "a" || flag == "a+" ||
                                     flag == "as" || flag == "as+") {
                                   append = true;
                                 }
                               }
                               if (opts.hasProperty(rt, "append")) {
                                 auto value = opts.getProperty(rt, "append");
                                 if (value.isBool()) {
                                   append = value.getBool();
                                 }
                               }
                             }
                           }

                           try {
                             std::vector<unsigned char> bytes;
                             if (encoding == "utf8" || encoding == "utf-8") {
                               bytes.assign(data.begin(), data.end());
                             } else if (encoding == "base64") {
                               bytes = base64Decode(data);
                             } else {
                               throw facebook::jsi::JSError(
                                   rt, "Unsupported encoding in writeFile");
                             }
                             writeFileBytes(target, bytes, append);
                             return facebook::jsi::Value::undefined();
                           } catch (const std::exception &error) {
                             throw facebook::jsi::JSError(rt, error.what());
                           }
                         }));

  native.setProperty(runtime, "mkdir",
                     facebook::jsi::Function::createFromHostFunction(
                         runtime,
                         facebook::jsi::PropNameID::forAscii(runtime, "mkdir"),
                         2, [](facebook::jsi::Runtime &rt,
                               const facebook::jsi::Value &,
                               const facebook::jsi::Value *args,
                               size_t count) -> facebook::jsi::Value {
                           if (count < 1 || !args[0].isString()) {
                             throw facebook::jsi::JSError(
                                 rt, "fs.mkdir requires a path");
                           }
                           fs::path target(args[0].asString(rt).utf8(rt));
                           bool recursive = false;
                           if (count >= 2 && args[1].isObject()) {
                             auto opts = args[1].asObject(rt);
                             if (opts.hasProperty(rt, "recursive")) {
                               auto value = opts.getProperty(rt, "recursive");
                               if (value.isBool()) {
                                 recursive = value.getBool();
                               }
                             }
                           }
                           std::error_code ec;
                           if (recursive) {
                             fs::create_directories(target, ec);
                           } else {
                             fs::create_directory(target, ec);
                           }
                           if (ec) {
                             throw facebook::jsi::JSError(rt, ec.message());
                           }
                           return facebook::jsi::Value::undefined();
                         }));

  native.setProperty(runtime, "rm",
                     facebook::jsi::Function::createFromHostFunction(
                         runtime,
                         facebook::jsi::PropNameID::forAscii(runtime, "rm"), 2,
                         [](facebook::jsi::Runtime &rt,
                            const facebook::jsi::Value &,
                            const facebook::jsi::Value *args,
                            size_t count) -> facebook::jsi::Value {
                           if (count < 1 || !args[0].isString()) {
                             throw facebook::jsi::JSError(
                                 rt, "fs.rm requires a path");
                           }
                           fs::path target(args[0].asString(rt).utf8(rt));
                           bool recursive = false;
                           bool force = false;
                           if (count >= 2 && args[1].isObject()) {
                             auto opts = args[1].asObject(rt);
                             if (opts.hasProperty(rt, "recursive")) {
                               auto value = opts.getProperty(rt, "recursive");
                               if (value.isBool()) {
                                 recursive = value.getBool();
                               }
                             }
                             if (opts.hasProperty(rt, "force")) {
                               auto value = opts.getProperty(rt, "force");
                               if (value.isBool()) {
                                 force = value.getBool();
                               }
                             }
                           }
                           std::error_code ec;
                           if (recursive) {
                             fs::remove_all(target, ec);
                           } else {
                             fs::remove(target, ec);
                           }
                           if (ec && !force) {
                             throw facebook::jsi::JSError(rt, ec.message());
                           }
                           return facebook::jsi::Value::undefined();
                         }));

  native.setProperty(runtime, "realpath",
                     facebook::jsi::Function::createFromHostFunction(
                         runtime, facebook::jsi::PropNameID::forAscii(
                                      runtime, "realpath"),
                         1, [](facebook::jsi::Runtime &rt,
                               const facebook::jsi::Value &,
                               const facebook::jsi::Value *args,
                               size_t count) -> facebook::jsi::Value {
                           if (count < 1 || !args[0].isString()) {
                             throw facebook::jsi::JSError(rt,
                                                          "fs.realpath requires a path");
                           }
                           fs::path target(args[0].asString(rt).utf8(rt));
                           std::error_code ec;
                           auto resolved = fs::weakly_canonical(target, ec);
                           if (ec) {
                             throw facebook::jsi::JSError(rt, ec.message());
                           }
                           return facebook::jsi::String::createFromUtf8(
                               rt, resolved.string());
                         }));

  runtime.global().setProperty(runtime, "__nodeFsNative", native);
}

static void installNodeModules(facebook::jsi::Runtime &runtime,
                               const PlatformInfo &platform) {
  installFsBindings(runtime);
  runtime.global().setProperty(runtime, "__nodeOsInfo",
                               makeOsInfo(runtime, platform));
}

static void installProcessBindings(facebook::jsi::Runtime &runtime,
                                   const PlatformInfo &platform) {
  if (!runtime.global().hasProperty(runtime, "process")) {
    return;
  }
  auto process = runtime.global().getPropertyAsObject(runtime, "process");

  process.setProperty(runtime, "platform",
                      facebook::jsi::String::createFromUtf8(runtime,
                                                            platform.os));
  process.setProperty(runtime, "arch",
                      facebook::jsi::String::createFromUtf8(runtime,
                                                            detectArchitecture()));
  process.setProperty(runtime, "version",
                      facebook::jsi::String::createFromUtf8(runtime,
                                                            "imgui-runtime"));
  facebook::jsi::Object versions(runtime);
  versions.setProperty(runtime, "node",
                       facebook::jsi::String::createFromUtf8(runtime, "0.0"));
  versions.setProperty(runtime, "hermes",
                       facebook::jsi::String::createFromUtf8(runtime,
                                                             "unknown"));
  process.setProperty(runtime, "versions", versions);

  auto envTarget = process.getPropertyAsObject(runtime, "env");
  auto envSource = readEnvironment(runtime);
  auto keys = envSource.getPropertyNames(runtime);
  size_t length = keys.size(runtime);
  for (size_t i = 0; i < length; ++i) {
    auto keyValue = keys.getValueAtIndex(runtime, i);
    if (!keyValue.isString()) {
      continue;
    }
    std::string key = keyValue.asString(runtime).utf8(runtime);
    auto value = envSource.getProperty(runtime, key.c_str());
    envTarget.setProperty(runtime, key.c_str(), value);
  }

  process.setProperty(runtime, "cwd",
                      facebook::jsi::Function::createFromHostFunction(
                          runtime,
                          facebook::jsi::PropNameID::forAscii(runtime,
                                                               "cwd"),
                          0, [](facebook::jsi::Runtime &rt,
                                const facebook::jsi::Value &,
                                const facebook::jsi::Value *,
                                size_t) -> facebook::jsi::Value {
                            std::error_code ec;
                            auto current = fs::current_path(ec);
                            if (ec) {
                              throw facebook::jsi::JSError(rt, ec.message());
                            }
                            return facebook::jsi::String::createFromUtf8(
                                rt, current.string());
                          }));

  process.setProperty(runtime, "chdir",
                      facebook::jsi::Function::createFromHostFunction(
                          runtime,
                          facebook::jsi::PropNameID::forAscii(runtime,
                                                               "chdir"),
                          1, [](facebook::jsi::Runtime &rt,
                                const facebook::jsi::Value &,
                                const facebook::jsi::Value *args,
                                size_t count) -> facebook::jsi::Value {
                            if (count < 1 || !args[0].isString()) {
                              throw facebook::jsi::JSError(
                                  rt, "process.chdir requires a path");
                            }
                            fs::path target(args[0].asString(rt).utf8(rt));
                            std::error_code ec;
                            fs::current_path(target, ec);
                            if (ec) {
                              throw facebook::jsi::JSError(rt, ec.message());
                            }
                            return facebook::jsi::Value::undefined();
                          }));
}

} // namespace nodecompat

static std::string trim(const std::string &value) {
  size_t start = 0;
  size_t end = value.size();

  while (start < end && std::isspace(static_cast<unsigned char>(value[start]))) {
    ++start;
  }
  while (end > start &&
         std::isspace(static_cast<unsigned char>(value[end - 1]))) {
    --end;
  }

  return value.substr(start, end - start);
}

static std::string defaultReasonPhrase(int status) {
  switch (status) {
  case 200:
    return "OK";
  case 201:
    return "Created";
  case 202:
    return "Accepted";
  case 204:
    return "No Content";
  case 301:
    return "Moved Permanently";
  case 302:
    return "Found";
  case 304:
    return "Not Modified";
  case 400:
    return "Bad Request";
  case 401:
    return "Unauthorized";
  case 403:
    return "Forbidden";
  case 404:
    return "Not Found";
  case 405:
    return "Method Not Allowed";
  case 408:
    return "Request Timeout";
  case 409:
    return "Conflict";
  case 410:
    return "Gone";
  case 413:
    return "Payload Too Large";
  case 415:
    return "Unsupported Media Type";
  case 500:
    return "Internal Server Error";
  case 501:
    return "Not Implemented";
  case 502:
    return "Bad Gateway";
  case 503:
    return "Service Unavailable";
  default:
    break;
  }
  return "";
}

static size_t writeBodyCallback(void *contents, size_t size, size_t nmemb,
                                void *userp) {
  auto *buffer = static_cast<std::vector<unsigned char> *>(userp);
  size_t total = size * nmemb;
  unsigned char *data = static_cast<unsigned char *>(contents);
  buffer->insert(buffer->end(), data, data + total);
  return total;
}

static size_t headerCallback(char *buffer, size_t size, size_t nitems,
                             void *userp) {
  auto *result = static_cast<NativeFetchResult *>(userp);
  size_t total = size * nitems;
  std::string line(buffer, total);

  while (!line.empty() &&
         (line.back() == '\r' || line.back() == '\n')) {
    line.pop_back();
  }

  if (line.empty()) {
    return total;
  }

  if (line.rfind("HTTP/", 0) == 0) {
    // Status line, reset headers for final response segment
    result->headers.clear();
    size_t firstSpace = line.find(' ');
    if (firstSpace != std::string::npos) {
      size_t secondSpace = line.find(' ', firstSpace + 1);
      if (secondSpace != std::string::npos) {
        std::string statusCodeStr = line.substr(firstSpace + 1,
                                                secondSpace - firstSpace - 1);
        try {
          result->status = std::stoi(statusCodeStr);
        } catch (...) {
          result->status = 0;
        }
        result->statusText = trim(line.substr(secondSpace + 1));
      }
    }
  } else {
    size_t colon = line.find(':');
    if (colon != std::string::npos) {
      std::string key = trim(line.substr(0, colon));
      std::string value = trim(line.substr(colon + 1));
      result->headers.emplace_back(std::move(key), std::move(value));
    }
  }

  return total;
}

static void enqueueFetchResult(NativeFetchResult &&result) {
  std::lock_guard<std::mutex> lock(s_fetchQueueMutex);
  s_completedFetches.push(std::move(result));
}

static void performFetchRequest(NativeFetchRequest request) {
  NativeFetchResult result;
  result.id = request.id;
  result.url = request.url;

  CURL *curl = curl_easy_init();
  if (!curl) {
    result.errorMessage = "Failed to initialize CURL";
    enqueueFetchResult(std::move(result));
    return;
  }

  std::vector<unsigned char> responseBody;
  struct curl_slist *headerList = nullptr;

  curl_easy_setopt(curl, CURLOPT_URL, request.url.c_str());
  curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION,
                   request.followRedirects ? 1L : 0L);
  curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, writeBodyCallback);
  curl_easy_setopt(curl, CURLOPT_WRITEDATA, &responseBody);
  curl_easy_setopt(curl, CURLOPT_HEADERFUNCTION, headerCallback);
  curl_easy_setopt(curl, CURLOPT_HEADERDATA, &result);
  curl_easy_setopt(curl, CURLOPT_USERAGENT, "imgui-react-runtime/1.0");

  if (request.timeoutMs >= 0) {
    curl_easy_setopt(curl, CURLOPT_TIMEOUT_MS, request.timeoutMs);
  }

  if (!request.headers.empty()) {
    for (const auto &header : request.headers) {
      std::string headerLine = header.first + ": " + header.second;
      headerList = curl_slist_append(headerList, headerLine.c_str());
    }
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headerList);
  }

  if (request.method == "GET") {
    curl_easy_setopt(curl, CURLOPT_HTTPGET, 1L);
  } else if (request.method == "POST") {
    curl_easy_setopt(curl, CURLOPT_POST, 1L);
  } else {
    curl_easy_setopt(curl, CURLOPT_CUSTOMREQUEST, request.method.c_str());
  }

  if (request.hasBody) {
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, request.body.c_str());
    curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE,
                     static_cast<long>(request.body.size()));
  }

  char errorBuffer[CURL_ERROR_SIZE];
  errorBuffer[0] = '\0';
  curl_easy_setopt(curl, CURLOPT_ERRORBUFFER, errorBuffer);

  CURLcode code = curl_easy_perform(curl);
  if (code != CURLE_OK) {
    if (errorBuffer[0] != '\0') {
      result.errorMessage = errorBuffer;
    } else {
      result.errorMessage = curl_easy_strerror(code);
    }
  } else {
    long statusCode = 0;
    curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &statusCode);
    result.status = static_cast<int>(statusCode);
    result.ok = statusCode >= 200 && statusCode < 300;
    if (result.statusText.empty()) {
      result.statusText = defaultReasonPhrase(result.status);
    }

    char *effectiveUrl = nullptr;
    if (curl_easy_getinfo(curl, CURLINFO_EFFECTIVE_URL, &effectiveUrl) ==
            CURLE_OK &&
        effectiveUrl) {
      result.url = effectiveUrl;
    }

    result.bodyBase64 = base64Encode(responseBody);
  }

  if (headerList) {
    curl_slist_free_all(headerList);
  }

  curl_easy_cleanup(curl);
  enqueueFetchResult(std::move(result));
}

static void processFetchResults(facebook::hermes::HermesRuntime *hermes) {
  std::queue<NativeFetchResult> localQueue;
  {
    std::lock_guard<std::mutex> lock(s_fetchQueueMutex);
    if (s_completedFetches.empty()) {
      return;
    }
    std::swap(localQueue, s_completedFetches);
  }

  auto global = hermes->global();
  if (!global.hasProperty(*hermes, "__onNativeFetchComplete")) {
    // Nothing to dispatch to; drop results
    return;
  }

  auto callback =
      global.getPropertyAsFunction(*hermes, "__onNativeFetchComplete");

  while (!localQueue.empty()) {
    NativeFetchResult result = std::move(localQueue.front());
    localQueue.pop();

    facebook::jsi::Object resultObj(*hermes);
    resultObj.setProperty(*hermes, "id",
                          facebook::jsi::Value(result.id));

    if (!result.errorMessage.empty()) {
      resultObj.setProperty(
          *hermes, "error",
          facebook::jsi::String::createFromUtf8(*hermes, result.errorMessage));
    } else {
      resultObj.setProperty(*hermes, "ok",
                            facebook::jsi::Value(result.ok));
      resultObj.setProperty(*hermes, "status",
                            facebook::jsi::Value(result.status));
      resultObj.setProperty(
          *hermes, "statusText",
          facebook::jsi::String::createFromUtf8(*hermes, result.statusText));
      resultObj.setProperty(
          *hermes, "url",
          facebook::jsi::String::createFromUtf8(*hermes, result.url));

      facebook::jsi::Array headersArray(*hermes, result.headers.size());
      for (size_t i = 0; i < result.headers.size(); ++i) {
        const auto &header = result.headers[i];
        facebook::jsi::Array headerPair(*hermes, 2);
        headerPair.setValueAtIndex(
            *hermes, 0,
            facebook::jsi::String::createFromUtf8(*hermes, header.first));
        headerPair.setValueAtIndex(
            *hermes, 1,
            facebook::jsi::String::createFromUtf8(*hermes, header.second));
        headersArray.setValueAtIndex(*hermes, i, std::move(headerPair));
      }
      resultObj.setProperty(*hermes, "headers", std::move(headersArray));

      resultObj.setProperty(
          *hermes, "body",
          facebook::jsi::String::createFromUtf8(*hermes, result.bodyBase64));
    }

    callback.call(*hermes, resultObj);
    hermes->drainMicrotasks();
  }
}

static facebook::jsi::Value
nativeFetchStart(facebook::jsi::Runtime &runtime, const facebook::jsi::Value &,
                 const facebook::jsi::Value *args, size_t count) {
  if (count < 1 || !args[0].isString()) {
    throw facebook::jsi::JSError(runtime,
                                 "fetch requires a URL string argument");
  }

  NativeFetchRequest request;
  request.id = s_nextFetchRequestId.fetch_add(1);
  request.url = args[0].asString(runtime).utf8(runtime);

  if (count >= 2 && args[1].isObject()) {
    auto init = args[1].asObject(runtime);

    if (init.hasProperty(runtime, "method")) {
      auto methodValue = init.getProperty(runtime, "method");
      if (!methodValue.isUndefined() && !methodValue.isNull()) {
        request.method = methodValue.toString(runtime).utf8(runtime);
        for (auto &ch : request.method) {
          ch = std::toupper(static_cast<unsigned char>(ch));
        }
      }
    }

    if (init.hasProperty(runtime, "headers")) {
      auto headersValue = init.getProperty(runtime, "headers");
      if (headersValue.isObject()) {
        auto headersObj = headersValue.asObject(runtime);
        if (headersObj.isArray(runtime)) {
          size_t length = 0;
          auto lengthValue = headersObj.getProperty(runtime, "length");
          if (lengthValue.isNumber()) {
            length = static_cast<size_t>(lengthValue.asNumber());
          }
          for (size_t i = 0; i < length; ++i) {
            auto entryValue =
                headersObj.getProperty(runtime, std::to_string(i).c_str());
            if (!entryValue.isObject()) {
              continue;
            }
            auto entryObj = entryValue.asObject(runtime);
            if (!entryObj.isArray(runtime)) {
              continue;
            }
            std::string key;
            std::string value;
            auto keyValue = entryObj.getProperty(runtime, "0");
            if (!keyValue.isUndefined()) {
              key = keyValue.toString(runtime).utf8(runtime);
            }
            auto valueValue = entryObj.getProperty(runtime, "1");
            if (!valueValue.isUndefined()) {
              value = valueValue.toString(runtime).utf8(runtime);
            }
            if (!key.empty()) {
              request.headers.emplace_back(std::move(key), std::move(value));
            }
          }
        } else {
          auto propertyNames = headersObj.getPropertyNames(runtime);
          size_t length = propertyNames.size(runtime);
          for (size_t i = 0; i < length; ++i) {
            auto keyValue = propertyNames.getValueAtIndex(runtime, i);
            std::string key = keyValue.toString(runtime).utf8(runtime);
            auto propValue = headersObj.getProperty(runtime, key.c_str());
            std::string value = propValue.toString(runtime).utf8(runtime);
            request.headers.emplace_back(std::move(key), std::move(value));
          }
        }
      }
    }

    if (init.hasProperty(runtime, "body")) {
      auto bodyValue = init.getProperty(runtime, "body");
      if (!bodyValue.isUndefined() && !bodyValue.isNull()) {
        request.body = bodyValue.toString(runtime).utf8(runtime);
        request.hasBody = true;
      }
    }

    if (init.hasProperty(runtime, "timeout")) {
      auto timeoutValue = init.getProperty(runtime, "timeout");
      if (timeoutValue.isNumber()) {
        double timeoutDouble = timeoutValue.asNumber();
        if (std::isfinite(timeoutDouble) && timeoutDouble >= 0) {
          request.timeoutMs = static_cast<long>(timeoutDouble);
        }
      }
    }

    if (init.hasProperty(runtime, "redirect")) {
      auto redirectValue = init.getProperty(runtime, "redirect");
      if (redirectValue.isString()) {
        auto redirectStr = redirectValue.asString(runtime).utf8(runtime);
        if (redirectStr == "manual") {
          request.followRedirects = false;
        }
      }
    }
  }

  int requestId = request.id;
  std::thread(performFetchRequest, std::move(request)).detach();
  return facebook::jsi::Value(requestId);
}

  void imgui_register_embedded_image(const char *name,
                                     const unsigned char *data,
                                     unsigned size) {
    if (!name || !*name || !data || size == 0) {
      return;
    }

    embedded_images()[std::string(name)] = EmbeddedImage{data, size};
  }

class Image {
public:
  int w_ = 0, h_ = 0;
  sg_image image_ = {};
  simgui_image_t simguiImage_ = {};

  explicit Image(const char *path) {
    const EmbeddedImage *embedded = find_embedded_image(path ? path : "");

    unsigned char *data;
    int n;
    if (embedded) {
      data = stbi_load_from_memory(embedded->data, embedded->size, &w_, &h_,
                                   &n, 4);
    } else {
      data = stbi_load(path, &w_, &h_, &n, 4);
    }

    if (!data) {
      slog_func("ERROR", 1, 0, "Failed to load image", __LINE__, __FILE__,
                nullptr);
      abort();
    }

    image_ = sg_make_image(sg_image_desc{
        .width = w_,
        .height = h_,
        .data{.subimage[0][0] = {.ptr = data, .size = (size_t)w_ * h_ * 4}},
    });

    stbi_image_free(data);
    simguiImage_ = simgui_make_image(simgui_image_desc_t{image_, s_sampler});
  }

  ~Image() {
    simgui_destroy_image(simguiImage_);
    sg_destroy_image(image_);
  }
};

static std::vector<std::unique_ptr<Image>> s_images{};

static bool s_started = false;
static uint64_t s_start_time = 0;
static uint64_t s_last_fps_time = 0;
static double s_fps = 0;

// Performance metrics
static double s_react_avg_ms = 0;              // React reconciliation average (accumulated)
static double s_react_max_ms = 0;              // React reconciliation max (accumulated)
static double s_imgui_avg_ms = 0;              // ImGui render average (EMA, accumulated)
static double s_react_avg_ms_display = 0;      // React avg (displayed, updated once/sec)
static double s_react_max_ms_display = 0;      // React max (displayed, updated once/sec)
static double s_imgui_avg_ms_display = 0;      // ImGui render average (displayed, updated once/sec)

static std::vector<uint8_t> s_windowIconPixels{};

static int s_bundleMode = 0;
static std::string s_bundlePath{};

#if !defined(NDEBUG)
static std::filesystem::file_time_type s_bundleTimestamp{};
static bool s_bundleWatchEnabled = false;
static bool s_bundleReloadPending = false;
static int s_bundleCooldownFrames = 0;
#endif

void imgui_runtime_set_bundle_info(int bundleMode, const char *bundlePath) {
  s_bundleMode = bundleMode;

  if (bundlePath && *bundlePath) {
    std::filesystem::path candidate{bundlePath};
    std::error_code ec;
    auto canonical = std::filesystem::weakly_canonical(candidate, ec);
    if (!ec) {
      s_bundlePath = canonical.string();
    } else {
      s_bundlePath = candidate.string();
    }
  } else {
    s_bundlePath.clear();
  }

#if !defined(NDEBUG)
  s_bundleWatchEnabled = false;
  s_bundleReloadPending = false;
  s_bundleCooldownFrames = 0;
#endif
}

#if !defined(NDEBUG)
static void initialize_bundle_watch() {
  if (s_bundleMode != 2 || s_bundlePath.empty()) {
    return;
  }

  std::error_code ec;
  auto timestamp = std::filesystem::last_write_time(s_bundlePath, ec);
  if (!ec) {
    s_bundleTimestamp = timestamp;
    s_bundleWatchEnabled = true;
    printf("Hot reload watching: '%s'\n", s_bundlePath.c_str());
  } else {
    printf("Hot reload disabled: %s\n", ec.message().c_str());
  }
}

static bool reload_react_bundle() {
  if (s_bundleMode != 2 || s_bundlePath.empty()) {
    return false;
  }
  if (!s_hermesApp || !s_hermesApp->hermes) {
    return false;
  }

  printf("Reloading React bundle...\n");
  try {
    imgui_load_unit(s_hermesApp->hermes, nullptr, false, s_bundlePath.c_str(),
                    "react-unit-bundle.js");
    s_hermesApp->hermes->drainMicrotasks();

    auto global = s_hermesApp->hermes->global();
    if (global.hasProperty(*s_hermesApp->hermes, "reactApp")) {
      auto appObj = global.getPropertyAsObject(*s_hermesApp->hermes, "reactApp");
      if (appObj.hasProperty(*s_hermesApp->hermes, "render")) {
        appObj.getPropertyAsFunction(*s_hermesApp->hermes, "render")
            .call(*s_hermesApp->hermes);
      }
    }

    printf("React bundle hot reload complete.\n");
    return true;
  } catch (facebook::jsi::JSIException &e) {
    slog_func("ERROR", 1, 0, e.what(), __LINE__, __FILE__, nullptr);
  } catch (const std::exception &e) {
    slog_func("ERROR", 1, 0, e.what(), __LINE__, __FILE__, nullptr);
  }

  return false;
}

static void maybe_handle_hot_reload() {
  if (!s_bundleWatchEnabled || s_bundleMode != 2 || s_bundlePath.empty()) {
    return;
  }

  std::error_code ec;
  auto currentTime = std::filesystem::last_write_time(s_bundlePath, ec);
  if (!ec && currentTime != s_bundleTimestamp && !s_bundleReloadPending) {
    s_bundleTimestamp = currentTime;
    s_bundleReloadPending = true;
    s_bundleCooldownFrames = 2; // Wait a couple frames for write to finish
    printf("Detected bundle change. Scheduling hot reload...\n");
  }

  if (!s_bundleReloadPending) {
    return;
  }

  if (s_bundleCooldownFrames > 0) {
    --s_bundleCooldownFrames;
    return;
  }

  if (reload_react_bundle()) {
    s_bundleReloadPending = false;
  } else {
    s_bundleCooldownFrames = 2;
  }
}
#else
static void maybe_handle_hot_reload() {}
static void initialize_bundle_watch() {}
#endif


extern "C" int load_image(const char *path) {
  s_images.emplace_back(std::make_unique<Image>(path));
  return s_images.size() - 1;
}
extern "C" int image_width(int index) {
  if (index < 0 || index >= s_images.size()) {
    slog_func("ERROR", 1, 0, "Invalid image index", __LINE__, __FILE__,
              nullptr);
    return 0;
  }
  return s_images[index]->w_;
}
extern "C" int image_height(int index) {
  if (index < 0 || index >= s_images.size()) {
    slog_func("ERROR", 1, 0, "Invalid image index", __LINE__, __FILE__,
              nullptr);
    return 0;
  }
  return s_images[index]->h_;
}
extern "C" const simgui_image_t *image_simgui_image(int index) {
  if (index < 0 || index >= s_images.size()) {
    slog_func("ERROR", 1, 0, "Invalid image index", __LINE__, __FILE__,
              nullptr);
    return 0;
  }
  return &s_images[index]->simguiImage_;
}

static void app_init() {
  sg_desc desc = {.logger.func = slog_func, .context = sapp_sgcontext()};
  sg_setup(&desc);
  simgui_setup(simgui_desc_t{});
  apply_navigation_config();
  if (s_hermesApp && s_hermesApp->hermes) {
    update_navigation_state_js(*s_hermesApp->hermes);
  }

  s_sampler = sg_make_sampler(sg_sampler_desc{
      .min_filter = SG_FILTER_LINEAR,
      .mag_filter = SG_FILTER_LINEAR,
  });

  sdtx_desc_t sdtx_desc = {.fonts = {sdtx_font_kc854()},
                           .logger.func = slog_func};
  sdtx_setup(&sdtx_desc);

  try {
    s_hermesApp->hermes->global()
        .getPropertyAsFunction(*s_hermesApp->hermes, "on_init")
        .call(*s_hermesApp->hermes);
    s_hermesApp->hermes->drainMicrotasks();
    push_window_metrics_to_js();
  } catch (facebook::jsi::JSIException &e) {
    slog_func("ERROR", 1, 0, e.what(), __LINE__, __FILE__, nullptr);
    abort();
  }
}

static void app_cleanup() {
  s_images.clear();
  simgui_shutdown();
  sdtx_shutdown();
  sg_shutdown();
  curl_global_cleanup();

  delete s_hermesApp;
  s_hermesApp = nullptr;
}

static void app_event(const sapp_event *ev) {
  if (ev->type == SAPP_EVENTTYPE_KEY_DOWN && ev->key_code == SAPP_KEYCODE_Q &&
      (ev->modifiers & SAPP_MODIFIER_SUPER)) {
    sapp_request_quit();
    return;
  }

  try {
    s_hermesApp->hermes->global()
        .getPropertyAsFunction(*s_hermesApp->hermes, "on_event")
        .call(*s_hermesApp->hermes, (double)ev->type, (double)ev->key_code,
              (double)ev->modifiers);
    // Drain microtasks after event (browser behavior)
    s_hermesApp->hermes->drainMicrotasks();
  } catch (facebook::jsi::JSIException &e) {
    slog_func("ERROR", 1, 0, e.what(), __LINE__, __FILE__, nullptr);
  }

  if (simgui_handle_event(ev))
    return;
}

static float s_bg_color[4] = {0.0f, 0.0f, 0.0f, 0.0f};
extern "C" float *get_bg_color() { return s_bg_color; }

static void update_performance_metrics() {
  // Read performance metrics from JavaScript
  try {
    auto global = s_hermesApp->hermes->global();

    if (global.hasProperty(*s_hermesApp->hermes, "perfMetrics")) {
      auto metrics = global.getPropertyAsObject(*s_hermesApp->hermes, "perfMetrics");

      // Read React reconciliation stats (calculated in JS)
      if (metrics.hasProperty(*s_hermesApp->hermes, "reconciliationAvg")) {
        s_react_avg_ms = metrics.getProperty(*s_hermesApp->hermes, "reconciliationAvg").asNumber();
      }
      if (metrics.hasProperty(*s_hermesApp->hermes, "reconciliationMax")) {
        s_react_max_ms = metrics.getProperty(*s_hermesApp->hermes, "reconciliationMax").asNumber();
      }

      // Read and calculate EMA for ImGui render time (every frame)
      if (metrics.hasProperty(*s_hermesApp->hermes, "renderTime")) {
        double renderTime = metrics.getProperty(*s_hermesApp->hermes, "renderTime").asNumber();
        const double alpha = 0.1;  // Smoothing factor
        s_imgui_avg_ms = s_imgui_avg_ms * (1.0 - alpha) + renderTime * alpha;
      }
    }
  } catch (...) {
    // Ignore errors reading metrics
  }
}

static void app_frame() {
  uint64_t now = stm_now();
  double curTimeMs = stm_ms(now);

  if (s_hermesApp && s_hermesApp->hermes) {
    processFetchResults(s_hermesApp->hermes);
  }

  maybe_handle_hot_reload();
  push_window_metrics_to_js();

  if (!s_started) {
    s_started = true;
    s_start_time = now;
    s_last_fps_time = now;
  } else {
    // Update FPS and displayed performance metrics every second
    uint64_t diff = stm_diff(now, s_last_fps_time);
    if (diff > 1000000000) {
      s_fps = 1.0 / sapp_frame_duration();
      s_imgui_avg_ms_display = s_imgui_avg_ms;  // Update displayed value
      s_react_avg_ms_display = s_react_avg_ms;  // Update displayed value
      s_react_max_ms_display = s_react_max_ms;  // Update displayed value
      s_last_fps_time = now;
    }
  }

  simgui_new_frame({
      .width = sapp_width(),
      .height = sapp_height(),
      .delta_time = sapp_frame_duration(),
      .dpi_scale = sapp_dpi_scale(),
  });

  // Setup pass action to clear the framebuffer with yellow color
  sg_pass_action pass_action = {
      .colors[0] = {.load_action = SG_LOADACTION_CLEAR,
                    .clear_value = {s_bg_color[0], s_bg_color[1], s_bg_color[2],
                                    s_bg_color[3]}}};

  // Begin and end pass
  sg_begin_default_pass(&pass_action, sapp_width(), sapp_height());

  try {
    // Run all ready macrotasks before rendering frame
    double nextTimeMs;
    while ((nextTimeMs = s_hermesApp->peekMacroTask.call(*s_hermesApp->hermes)
                             .getNumber()) >= 0 &&
           nextTimeMs <= curTimeMs) {
      s_hermesApp->runMacroTask.call(*s_hermesApp->hermes, curTimeMs);
      s_hermesApp->hermes->drainMicrotasks();
    }

    // Render frame (this is also a macrotask)
    s_hermesApp->hermes->global()
        .getPropertyAsFunction(*s_hermesApp->hermes, "on_frame")
        .call(*s_hermesApp->hermes, sapp_widthf(), sapp_heightf(),
              stm_sec(stm_diff(now, s_start_time)));

    // Drain microtasks after frame rendering
    s_hermesApp->hermes->drainMicrotasks();
  } catch (facebook::jsi::JSIException &e) {
    slog_func("ERROR", 1, 0, e.what(), __LINE__, __FILE__, nullptr);
  }

  update_performance_metrics();

  simgui_render();
  sdtx_canvas((float)sapp_width(), (float)sapp_height());

  // Position at bottom-left corner
  // Each character is 8x8 pixels, calculate rows from bottom
  int num_rows = (int)sapp_height() / 8;
  int num_lines = s_react_avg_ms_display > 0 ? 3 : 2;  // FPS + ImGui [+ React]
  sdtx_pos(0.0f, (float)(num_rows - num_lines));

  sdtx_printf("FPS: %d\n", (int)(s_fps + 0.5));
  sdtx_printf("ImGui: %dus\n", (int)(s_imgui_avg_ms_display * 1000.0 + 0.5));
  if (s_react_avg_ms_display > 0) {
    sdtx_printf("React: %d/%dus",
                (int)(s_react_avg_ms_display * 1000.0 + 0.5),
                (int)(s_react_max_ms_display * 1000.0 + 0.5));
  }
  sdtx_draw();
  sg_end_pass();
  sg_commit();
}

/// sapp_desc that will be populated from globalThis.sappConfig
static sapp_desc s_app_desc{};

/// Safely convert double to int, avoiding undefined behavior
static int safe_double_to_int(double value, int defaultValue) {
  if (!std::isfinite(value)) {
    return defaultValue;
  }
  if (value > static_cast<double>(INT_MAX)) {
    return INT_MAX;
  }
  if (value < static_cast<double>(INT_MIN)) {
    return INT_MIN;
  }
  return static_cast<int>(value);
}

/// Populate sapp_desc from globalThis.sappConfig
static void populate_sapp_desc_from_config(facebook::hermes::HermesRuntime *hermes) {
  sapp_desc desc = {};

  // Set callbacks
  desc.init_cb = app_init;
  desc.frame_cb = app_frame;
  desc.cleanup_cb = app_cleanup;
  desc.event_cb = app_event;
  desc.logger.func = slog_func;

  // Default title
  desc.window_title = "imgui-react-runtime";

  // Read globalThis.sappConfig if it exists
  auto global = hermes->global();
  if (global.hasProperty(*hermes, "sappConfig")) {
    auto config = global.getPropertyAsObject(*hermes, "sappConfig");

    // Macros to reduce repetition when reading properties
#define READ_INT_PROP(js_name, field, default_val) \
    if (config.hasProperty(*hermes, js_name)) { \
      auto value = config.getProperty(*hermes, js_name); \
      if (value.isNumber()) { \
        desc.field = safe_double_to_int(value.asNumber(), default_val); \
      } \
    }

#define READ_BOOL_PROP(js_name, field) \
    if (config.hasProperty(*hermes, js_name)) { \
      auto value = config.getProperty(*hermes, js_name); \
      if (value.isBool()) { \
        desc.field = value.asBool(); \
      } \
    }

    // Read string fields (title is special - needs static storage)
    if (config.hasProperty(*hermes, "title")) {
      auto titleValue = config.getProperty(*hermes, "title");
      if (titleValue.isString()) {
        // Store the string in a static buffer to keep it alive
        static std::string titleStorage;
        titleStorage = titleValue.asString(*hermes).utf8(*hermes);
        desc.window_title = titleStorage.c_str();
      }
    }

    // Read int fields
    READ_INT_PROP("width", width, 0);
    READ_INT_PROP("height", height, 0);
    READ_INT_PROP("sample_count", sample_count, 1);
    READ_INT_PROP("swap_interval", swap_interval, 1);
    READ_INT_PROP("clipboard_size", clipboard_size, 8192);
    READ_INT_PROP("max_dropped_files", max_dropped_files, 1);
    READ_INT_PROP("max_dropped_file_path_length", max_dropped_file_path_length, 2048);

    // Read bool fields
    READ_BOOL_PROP("fullscreen", fullscreen);
    READ_BOOL_PROP("high_dpi", high_dpi);
    READ_BOOL_PROP("alpha", alpha);
    READ_BOOL_PROP("enable_clipboard", enable_clipboard);
    READ_BOOL_PROP("enable_dragndrop", enable_dragndrop);

    // Load window icon if provided
    if (config.hasProperty(*hermes, "iconPath")) {
      auto iconValue = config.getProperty(*hermes, "iconPath");
      if (iconValue.isString()) {
        auto iconStr = iconValue.asString(*hermes).utf8(*hermes);

        const EmbeddedImage *embedded = find_embedded_image(iconStr);
        int width = 0;
        int height = 0;
        int comp = 0;
        stbi_uc *pixels = nullptr;
        std::string iconPathStr = iconStr;

        if (embedded) {
          pixels = stbi_load_from_memory(embedded->data, embedded->size, &width,
                                         &height, &comp, 4);
        }

        if (!pixels) {
          try {
            std::filesystem::path iconPath = iconStr;
            if (!iconPath.is_absolute()) {
              iconPath = std::filesystem::current_path() / iconPath;
            }
            iconPath = std::filesystem::weakly_canonical(iconPath);
            iconPathStr = iconPath.string();

            if (!embedded) {
              embedded = find_embedded_image(iconPathStr);
              if (embedded) {
                pixels = stbi_load_from_memory(embedded->data, embedded->size,
                                               &width, &height, &comp, 4);
              }
            }

            if (!pixels) {
              pixels = stbi_load(iconPathStr.c_str(), &width, &height, &comp, 4);
            }
          } catch (const std::exception &e) {
            slog_func("ERROR", 1, 0, e.what(), __LINE__, __FILE__, nullptr);
          }
        }

        if (pixels) {
          s_windowIconPixels.assign(pixels, pixels + (width * height * 4));
          stbi_image_free(pixels);

          desc.icon = {};
          desc.icon.images[0].width = width;
          desc.icon.images[0].height = height;
          desc.icon.images[0].pixels.ptr = s_windowIconPixels.data();
          desc.icon.images[0].pixels.size = s_windowIconPixels.size();
        } else {
          std::string message = "Failed to load icon: " + iconPathStr;
          slog_func("ERROR", 1, 0, message.c_str(), __LINE__, __FILE__, nullptr);
        }
      }
    }

#undef READ_INT_PROP
#undef READ_BOOL_PROP
  }

  s_app_desc = desc;
}

/// jslib-unit initialization.
extern "C" SHUnit *sh_export_jslib(void);
/// imgui-unit initialization.
extern "C" SHUnit *sh_export_imgui(void);

sapp_desc sokol_main(int argc, char *argv[]) {
  // Initialize Sokol time before anything else
  stm_setup();
  s_runtimeStartMs = stm_ms(stm_now());
  if (curl_global_init(CURL_GLOBAL_DEFAULT) != 0) {
    printf("Failed to initialize libcurl\n");
    exit(1);
  }
  // Enable microtask queue for Promise support
  auto runtimeConfig = ::hermes::vm::RuntimeConfig::Builder()
                           .withMicrotaskQueue(true)
                           .withES6BlockScoping(true)
                           .build();
  SHRuntime *shr = _sh_init(runtimeConfig);
  facebook::hermes::HermesRuntime *hermes = _sh_get_hermes_runtime(shr);

  try {
    // Load jslib unit first to set up event loop and extract helper functions
    // from jslib result
    facebook::jsi::Object helpers =
        hermes->evaluateSHUnit(sh_export_jslib).asObject(*hermes);

    // Create and initialize HermesApp
    s_hermesApp =
        new HermesApp(shr, helpers.getPropertyAsFunction(*hermes, "peek"),
                      helpers.getPropertyAsFunction(*hermes, "run"));

  PlatformInfo platformInfo = detect_platform_info();
  nodecompat::installNodeModules(*hermes, platformInfo);
  nodecompat::installProcessBindings(*hermes, platformInfo);

  auto nativeFetchFn = facebook::jsi::Function::createFromHostFunction(
    *hermes,
    facebook::jsi::PropNameID::forAscii(*hermes, "__nativeFetch"), 2,
    nativeFetchStart);
  hermes->global().setProperty(*hermes, "__nativeFetch", nativeFetchFn);

  auto navConfigureFn = facebook::jsi::Function::createFromHostFunction(
      *hermes,
      facebook::jsi::PropNameID::forAscii(*hermes, "__configureImGuiNavigation"),
      2, configure_navigation_host);
  hermes->global().setProperty(*hermes, "__configureImGuiNavigation",
                               navConfigureFn);

  update_navigation_state_js(*hermes);

  // Set NODE_ENV based on build configuration
#ifdef NDEBUG
  const char *nodeEnv = "production";
#else
  const char *nodeEnv = "development";
#endif
  hermes->global()
    .getPropertyAsObject(*hermes, "process")
    .getPropertyAsObject(*hermes, "env")
    .setProperty(*hermes, "NODE_ENV", nodeEnv);

    // Initialize jslib's current time
    double curTimeMs = stm_ms(stm_now());
    s_hermesApp->runMacroTask.call(*s_hermesApp->hermes, curTimeMs);

    // Add performance.now() host function using Sokol time
    auto perf = facebook::jsi::Object(*s_hermesApp->hermes);
    perf.setProperty(
        *s_hermesApp->hermes, "now",
        facebook::jsi::Function::createFromHostFunction(
            *s_hermesApp->hermes,
            facebook::jsi::PropNameID::forAscii(*s_hermesApp->hermes, "now"), 0,
            [](facebook::jsi::Runtime &, const facebook::jsi::Value &,
               const facebook::jsi::Value *,
               size_t) -> facebook::jsi::Value { return stm_ms(stm_now()); }));
    s_hermesApp->hermes->global().setProperty(*s_hermesApp->hermes,
                                              "performance", perf);

  push_platform_info_to_js(hermes, platformInfo);

    // Create globalThis.sappConfig with default title
    auto sappConfig = facebook::jsi::Object(*s_hermesApp->hermes);
    sappConfig.setProperty(*s_hermesApp->hermes, "title",
                           facebook::jsi::String::createFromAscii(
                               *s_hermesApp->hermes, "imgui-react-runtime"));
    s_hermesApp->hermes->global().setProperty(*s_hermesApp->hermes,
                                              "sappConfig", sappConfig);

    imgui_main(argc, argv, hermes);

    // Load imgui unit
    hermes->evaluateSHUnit(sh_export_imgui);

    // Populate sapp_desc from globalThis.sappConfig
    populate_sapp_desc_from_config(hermes);

#if !defined(NDEBUG)
  initialize_bundle_watch();
#endif

    if (!s_app_desc.init_cb)
      throw facebook::jsi::JSINativeException(
          "sokol_app not configured from JS");

    return s_app_desc;
  } catch (facebook::jsi::JSError &e) {
    // Handle JS exceptions here.
    printf("JS Exception: %s\n", e.getStack().c_str());
  } catch (facebook::jsi::JSIException &e) {
    // Handle JSI exceptions here.
    printf("JSI Exception: %s\n", e.what());
  } catch (const std::exception &e) {
    printf("C++ Exception: %s\n", e.what());
  }

  _sh_done(shr);
  curl_global_cleanup();
  exit(1);
}

void imgui_load_unit(facebook::hermes::HermesRuntime *hermes,
                       SHUnitCreator nativeUnit, bool bytecode,
                       const char *jsPath, const char *sourceURL) {
  if (nativeUnit) {
    hermes->evaluateSHUnit(nativeUnit);
    printf("Native unit loaded.\n");
  }

  if (jsPath && bytecode) {
    // Mode 1: Bytecode - load .hbc file via evaluateJavaScript
    printf("Loading React unit from bytecode: '%s'\n", jsPath);
    auto buffer = mapFileBuffer(jsPath, false);
    hermes->evaluateJavaScript(buffer, sourceURL ? sourceURL : jsPath);
    printf("React unit loaded (bytecode).\n");
  } else if (jsPath && !bytecode) {
    // Mode 2: Source - load .js file with source map
    printf("Loading React unit from source: '%s'\n", jsPath);
    auto buffer = mapFileBuffer(jsPath, true);

    // Try to load source map (bundle path + ".map")
    std::string sourceMapPath = std::string(jsPath) + ".map";
    std::shared_ptr<const facebook::jsi::Buffer> sourceMapBuf;
    bool hasSourceMap = false;
    try {
      sourceMapBuf = mapFileBuffer(sourceMapPath.c_str(), true);
      printf("Loaded source map: '%s'\n", sourceMapPath.c_str());
      hasSourceMap = true;
    } catch (const std::exception &e) {
      printf("Source map not found: %s\n", e.what());
    }

    // Evaluate JavaScript with or without source map
    if (hasSourceMap) {
      hermes->evaluateJavaScriptWithSourceMap(buffer, sourceMapBuf,
                                              sourceURL ? sourceURL : jsPath);
    } else {
      hermes->evaluateJavaScript(buffer, sourceURL ? sourceURL : jsPath);
    }
    printf("React unit loaded (source).\n");
  }
}
