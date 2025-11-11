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

// Must be separate to avoid reordering.
#include "sokol_debugtext.h"

#include <hermes/VM/static_h.h>

#include <cmath>
#include <climits>
#include <filesystem>
#include <string>
#include <string_view>
#include <unordered_map>
#include <vector>

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

  maybe_handle_hot_reload();

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

    // Create and initialize HermesApp
    s_hermesApp =
        new HermesApp(shr, helpers.getPropertyAsFunction(*hermes, "peek"),
                      helpers.getPropertyAsFunction(*hermes, "run"));

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
