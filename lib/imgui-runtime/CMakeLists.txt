# Copyright (c) Tzvetan Mikov and contributors
# SPDX-License-Identifier: MIT
# See LICENSE file for full license text

if(NOT IMGUI_PLATFORM_WEB)
    find_package(CURL REQUIRED)
endif()

set(_imgui_runtime_libcurl_target)
if(TARGET CURL::libcurl)
    set(_imgui_runtime_libcurl_target CURL::libcurl)
endif()

add_library(imgui-runtime imgui-runtime.cpp
    MappedFileBuffer.cpp
    MappedFileBuffer.h
    imgui-runtime.h
)
target_compile_features(imgui-runtime PUBLIC cxx_std_17)
target_link_directories(imgui-runtime INTERFACE
    ${HERMES_BUILD}/lib
    ${HERMES_BUILD}/jsi
    ${HERMES_BUILD}/external/boost/boost_1_86_0/libs/context
)
target_link_libraries(imgui-runtime
    sokol stb cimgui imgui-unit jslib-unit
    $<$<CONFIG:Release>:hermesvm_a jsi boost_context>
    $<$<CONFIG:Debug>:hermesvm>
    $<$<PLATFORM_ID:Linux>:icuuc icui18n icudata>
    ${_imgui_runtime_libcurl_target}
)
target_include_directories(imgui-runtime
    PUBLIC
        ${CMAKE_CURRENT_SOURCE_DIR}
        ${HERMES_BUILD}/lib/config
        ${HERMES_SRC}/include
        ${HERMES_SRC}/public
        ${HERMES_SRC}/API
        ${HERMES_SRC}/API/jsi
)

if(IMGUI_PLATFORM_WEB)
    target_compile_definitions(imgui-runtime PUBLIC IMGUI_PLATFORM_WEB=1 IMGUI_WEB_JSLIB_PATH="/runtime/jslib.js")
else()
    target_compile_definitions(imgui-runtime PUBLIC IMGUI_PLATFORM_WEB=0)
endif()
