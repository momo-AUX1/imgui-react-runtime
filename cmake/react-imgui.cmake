# Copyright (c) Tzvetan Mikov and contributors
# SPDX-License-Identifier: MIT
# See LICENSE file for full license text

# CMake functions for building React+ImGui applications
#
# This file provides convenience functions for creating React applications
# that render to ImGui using the custom reconciler.

#[[
Create a React+ImGui application executable

This function handles all the boilerplate for building a React application:
- Automatically collects all *.jsx and *.js files in the current directory
- Bundles with esbuild (transpiling JSX, resolving modules)
- Compiles based on REACT_BUNDLE_MODE (0=native, 1=bytecode, 2=source)
- Creates the executable target with proper configuration
- Links against imgui-runtime

Usage:
  add_react_imgui_app(
    TARGET <target-name>
    ENTRY_POINT <entry-js-file>
    SOURCES <cpp-source-files>...
    [ADDITIONAL_JS_DEPS <extra-js-dependencies>...]
  )

Arguments:
  TARGET             - Name of the executable target to create (e.g., jsdemo)
  ENTRY_POINT        - JavaScript entry point file (e.g., index.js)
  SOURCES            - C++ source files to compile (e.g., jsdemo.cpp)
  ADDITIONAL_JS_DEPS - Optional additional JS dependencies beyond auto-detected files

Example:
  add_react_imgui_app(
    TARGET jsdemo
    ENTRY_POINT index.js
    SOURCES jsdemo.cpp
  )

This will create an executable named 'jsdemo' that:
1. Bundles all *.jsx and *.js files from the current directory
2. Compiles the bundle based on REACT_BUNDLE_MODE
3. Links with imgui-runtime and Hermes
4. Defines REACT_BUNDLE_MODE and REACT_BUNDLE_PATH macros
]]
function(add_react_imgui_app)
    # Parse arguments
    cmake_parse_arguments(
        ARG                                      # Prefix
        ""                                       # Options
        "TARGET;ENTRY_POINT"                    # Single value args
        "SOURCES;ADDITIONAL_JS_DEPS"            # Multi-value args
        ${ARGN}
    )

    # Validate required arguments
    if(NOT ARG_TARGET)
        message(FATAL_ERROR "add_react_imgui_app: TARGET is required")
    endif()
    if(NOT ARG_ENTRY_POINT)
        message(FATAL_ERROR "add_react_imgui_app: ENTRY_POINT is required")
    endif()
    if(NOT ARG_SOURCES)
        message(FATAL_ERROR "add_react_imgui_app: SOURCES is required")
    endif()

    # Set up bundle path
    set(REACT_UNIT_BUNDLE ${CMAKE_CURRENT_BINARY_DIR}/react-unit-bundle.js)

    # Collect app source files automatically
    file(GLOB APP_FILES
        CONFIGURE_DEPENDS
        ${CMAKE_CURRENT_SOURCE_DIR}/*.jsx
        ${CMAKE_CURRENT_SOURCE_DIR}/*.js
    )

    # Check if npm install has been run
    if(NOT EXISTS "${CMAKE_SOURCE_DIR}/node_modules")
        message(FATAL_ERROR "node_modules/ directory not found. Please run 'npm install' in the project root before building.")
    endif()

    # Determine the runtime source directory
    # If IMGUI_REACT_RUNTIME_SOURCE_DIR is set (external projects), use it
    # Otherwise, assume we're in the imgui-react-runtime project itself
    if(DEFINED IMGUI_REACT_RUNTIME_SOURCE_DIR)
        set(RUNTIME_SOURCE_DIR ${IMGUI_REACT_RUNTIME_SOURCE_DIR})
    else()
        set(RUNTIME_SOURCE_DIR ${CMAKE_SOURCE_DIR})
    endif()

    # Build dependency list
    set(REACT_UNIT_DEPS
        ${RECONCILER_FILES}
        ${APP_FILES}
        ${RUNTIME_SOURCE_DIR}/scripts/bundle-react-unit.js
        ${RUNTIME_SOURCE_DIR}/.babelrc.cjs
    )
    if(ARG_ADDITIONAL_JS_DEPS)
        list(APPEND REACT_UNIT_DEPS ${ARG_ADDITIONAL_JS_DEPS})
    endif()

    # Bundle with esbuild
    add_custom_command(OUTPUT ${REACT_UNIT_BUNDLE}
        COMMAND ${CMAKE_COMMAND} -E env
            USE_REACT_COMPILER=$<IF:$<BOOL:${USE_REACT_COMPILER}>,true,false>
            node ${RUNTIME_SOURCE_DIR}/scripts/bundle-react-unit.js
            ${ARG_ENTRY_POINT}
            ${REACT_UNIT_BUNDLE}
            $<IF:$<CONFIG:Debug>,development,production>
        DEPENDS ${REACT_UNIT_DEPS}
        WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}
        COMMENT "Bundling ${ARG_TARGET} React unit with esbuild (NODE_ENV=$<IF:$<CONFIG:Debug>,development,production>, React Compiler=${USE_REACT_COMPILER})"
    )

    # Prepare platform-specific assets
    set(APP_ICON_SOURCE ${CMAKE_CURRENT_SOURCE_DIR}/icon.png)
    set(MACOSX_ICON_FILE "")

    if(APPLE)
        if(EXISTS "${APP_ICON_SOURCE}")
            set(MACOSX_ICON_FILE ${CMAKE_CURRENT_BINARY_DIR}/AppIcon.icns)
            add_custom_command(
                OUTPUT ${MACOSX_ICON_FILE}
                COMMAND ${CMAKE_COMMAND}
                        -DINPUT=${APP_ICON_SOURCE}
                        -DOUTPUT=${MACOSX_ICON_FILE}
                        -P ${RUNTIME_SOURCE_DIR}/cmake/macos_bundle_icon.cmake
                DEPENDS ${APP_ICON_SOURCE}
                COMMENT "Generating macOS icon for ${ARG_TARGET}"
                VERBATIM
            )
        else()
            message(WARNING "${ARG_TARGET}: icon.png not found; macOS bundle will use the default icon")
        endif()
    endif()

    # Compile based on REACT_BUNDLE_MODE
    if(REACT_BUNDLE_MODE EQUAL 0)
        # Mode 0: Native compilation with shermes (slowest build, fastest runtime)
        set(REACT_UNIT_O react-unit${CMAKE_C_OUTPUT_EXTENSION})
        hermes_compile_native(
            OUTPUT ${CMAKE_CURRENT_BINARY_DIR}/${REACT_UNIT_O}
            SOURCES ${REACT_UNIT_BUNDLE}
            UNIT_NAME react
            DEPENDS ${REACT_UNIT_BUNDLE}
            WORKING_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}
            COMMENT "Compiling ${ARG_TARGET} React unit to native code"
        )
        set(REACT_UNIT_OUTPUT ${CMAKE_CURRENT_BINARY_DIR}/${REACT_UNIT_O})

    elseif(REACT_BUNDLE_MODE EQUAL 1)
        # Mode 1: Bytecode compilation with hermes (medium build/runtime speed)
        set(REACT_UNIT_HBC ${CMAKE_CURRENT_BINARY_DIR}/react-unit-bundle.hbc)
        hermes_compile_bytecode(
            OUTPUT ${REACT_UNIT_HBC}
            SOURCE ${REACT_UNIT_BUNDLE}
            SOURCE_MAP ${REACT_UNIT_BUNDLE}.map
            DEPENDS ${REACT_UNIT_BUNDLE}
        )
        set(REACT_UNIT_OUTPUT ${REACT_UNIT_HBC})

    elseif(REACT_BUNDLE_MODE EQUAL 2)
        # Mode 2: Source bundle only (fastest build, slowest runtime)
        set(REACT_UNIT_OUTPUT ${REACT_UNIT_BUNDLE})

    else()
        message(FATAL_ERROR "Invalid REACT_BUNDLE_MODE: ${REACT_BUNDLE_MODE}. Must be 0, 1, or 2.")
    endif()

    message(STATUS "${ARG_TARGET}: React bundle path: ${REACT_UNIT_OUTPUT}")

    # Create the executable target
    set(APP_TARGET_SOURCES ${ARG_SOURCES})
    if(REACT_BUNDLE_MODE EQUAL 0)
        list(APPEND APP_TARGET_SOURCES ${REACT_UNIT_OUTPUT})
    endif()

    if(APPLE)
        add_executable(${ARG_TARGET} MACOSX_BUNDLE ${APP_TARGET_SOURCES})
    else()
        add_executable(${ARG_TARGET} ${APP_TARGET_SOURCES})
    endif()

    if(REACT_BUNDLE_MODE EQUAL 0)
        # React native object already part of sources
    else()
        add_custom_target(${ARG_TARGET}_react_unit DEPENDS ${REACT_UNIT_OUTPUT})
        add_dependencies(${ARG_TARGET} ${ARG_TARGET}_react_unit)
    endif()

    if(APPLE)
        if(MACOSX_ICON_FILE)
            set_source_files_properties(${MACOSX_ICON_FILE} PROPERTIES MACOSX_PACKAGE_LOCATION "Resources")
            target_sources(${ARG_TARGET} PRIVATE ${MACOSX_ICON_FILE})
            set_target_properties(${ARG_TARGET} PROPERTIES MACOSX_BUNDLE_ICON_FILE "AppIcon.icns")
        endif()
    endif()

    # Set compile definitions
    target_compile_definitions(${ARG_TARGET} PRIVATE
        REACT_BUNDLE_MODE=${REACT_BUNDLE_MODE}
        REACT_BUNDLE_PATH="${REACT_UNIT_OUTPUT}"
    )

    # Link libraries
    target_link_libraries(${ARG_TARGET} imgui-runtime)
endfunction()
