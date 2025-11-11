# Generate a macOS .icns icon file from a source PNG image.
#
# Required variables:
#   INPUT  - Path to the source PNG image
#   OUTPUT - Destination .icns file path
#
# This script requires macOS command line tools `sips` and `iconutil`.

if(NOT APPLE)
  message(FATAL_ERROR "macos_bundle_icon.cmake should only be used on macOS")
endif()

if(NOT DEFINED INPUT OR NOT DEFINED OUTPUT)
  message(FATAL_ERROR "INPUT and OUTPUT variables must be provided")
endif()

if(NOT EXISTS "${INPUT}")
  message(FATAL_ERROR "Source image not found: ${INPUT}")
endif()

get_filename_component(INPUT_ABS "${INPUT}" ABSOLUTE)
get_filename_component(OUTPUT_ABS "${OUTPUT}" ABSOLUTE)

find_program(SIPS_TOOL sips)
if(NOT SIPS_TOOL)
  message(FATAL_ERROR "Required tool 'sips' not found")
endif()

find_program(ICONUTIL_TOOL iconutil)
if(NOT ICONUTIL_TOOL)
  message(FATAL_ERROR "Required tool 'iconutil' not found")
endif()

set(ICONSET_DIR "${OUTPUT_ABS}.iconset")
execute_process(COMMAND "${CMAKE_COMMAND}" -E rm -rf "${ICONSET_DIR}")
execute_process(COMMAND "${CMAKE_COMMAND}" -E make_directory "${ICONSET_DIR}")

set(ICON_SIZES 16 32 64 128 256 512 1024)
foreach(SIZE IN LISTS ICON_SIZES)
  set(ONE_FILE "${ICONSET_DIR}/icon_${SIZE}x${SIZE}.png")
  execute_process(
    COMMAND "${SIPS_TOOL}" -s format png -z ${SIZE} ${SIZE} "${INPUT_ABS}" --out "${ONE_FILE}"
    RESULT_VARIABLE RES
  )
  if(NOT RES EQUAL 0)
    message(FATAL_ERROR "Failed to generate ${SIZE}x${SIZE} icon with sips")
  endif()

  math(EXPR DOUBLE_SIZE "${SIZE} * 2")
  if(DOUBLE_SIZE GREATER 1024)
    continue()
  endif()
  set(TWO_FILE "${ICONSET_DIR}/icon_${SIZE}x${SIZE}@2x.png")
  execute_process(
    COMMAND "${SIPS_TOOL}" -s format png -z ${DOUBLE_SIZE} ${DOUBLE_SIZE} "${INPUT_ABS}" --out "${TWO_FILE}"
    RESULT_VARIABLE RES2
  )
  if(NOT RES2 EQUAL 0)
    message(FATAL_ERROR "Failed to generate ${SIZE}x${SIZE}@2x icon with sips")
  endif()
endforeach()

execute_process(
  COMMAND "${ICONUTIL_TOOL}" -c icns "${ICONSET_DIR}" -o "${OUTPUT_ABS}"
  RESULT_VARIABLE ICONUTIL_RES
)
if(NOT ICONUTIL_RES EQUAL 0)
  message(FATAL_ERROR "iconutil failed to create .icns file")
endif()

execute_process(COMMAND "${CMAKE_COMMAND}" -E rm -rf "${ICONSET_DIR}")
