cmake_minimum_required(VERSION 3.20)
project(PROJECT_NAME)

set(IMGUI_REACT_RUNTIME_PATH "__RUNTIME_PATH__")

if(NOT EXISTS "${IMGUI_REACT_RUNTIME_PATH}/CMakeLists.txt")
    message(FATAL_ERROR
        "imgui-react-runtime not found at ${IMGUI_REACT_RUNTIME_PATH}.\n"
        "Set IMGUI_REACT_RUNTIME_PATH to a valid installation or reinstall react-imgui.")
endif()

message(STATUS "Using imgui-react-runtime from: ${IMGUI_REACT_RUNTIME_PATH}")

set(IMGUI_REACT_RUNTIME_SOURCE_DIR ${IMGUI_REACT_RUNTIME_PATH} CACHE PATH "Path to imgui-react-runtime source")

if(EXISTS "${IMGUI_REACT_RUNTIME_PATH}/cmake-build-debug/hermes")
    message(STATUS "Using pre-built Hermes from ${IMGUI_REACT_RUNTIME_PATH}/cmake-build-debug")
    set(HERMES_BUILD_DIR "${IMGUI_REACT_RUNTIME_PATH}/cmake-build-debug/hermes" CACHE PATH "Path to Hermes build")
elseif(EXISTS "${IMGUI_REACT_RUNTIME_PATH}/cmake-build-release/hermes")
    message(STATUS "Using pre-built Hermes from ${IMGUI_REACT_RUNTIME_PATH}/cmake-build-release")
    set(HERMES_BUILD_DIR "${IMGUI_REACT_RUNTIME_PATH}/cmake-build-release/hermes" CACHE PATH "Path to Hermes build")
endif()

add_subdirectory(${IMGUI_REACT_RUNTIME_PATH} imgui-react-runtime-build EXCLUDE_FROM_ALL)

add_react_imgui_app(
    TARGET PROJECT_NAME
    ENTRY_POINT index.js
    SOURCES PROJECT_NAME.cpp
)

set(EMBED_ICON_CPP ${CMAKE_CURRENT_BINARY_DIR}/PROJECT_NAME_icon_embed.cpp)

add_custom_command(
    OUTPUT ${EMBED_ICON_CPP}
    COMMAND ${CMAKE_COMMAND}
        -DINPUT=${CMAKE_CURRENT_SOURCE_DIR}/icon.png
        -DOUTPUT=${EMBED_ICON_CPP}
        -DSYMBOL=PROJECT_NAME_icon_png
        -DKEY=icon.png
        -DALIAS=./icon.png
        -P ${IMGUI_REACT_RUNTIME_PATH}/cmake/embed_resource.cmake
    DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/icon.png
    COMMENT "Embedding icon.png into executable"
    VERBATIM
)

target_sources(PROJECT_NAME PRIVATE ${EMBED_ICON_CPP})
