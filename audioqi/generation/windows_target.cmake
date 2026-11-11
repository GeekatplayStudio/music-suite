# Passed to the engine build as CMAKE_PROJECT_INCLUDE by audioqi/generation/setup.py.
# Only MinGW compilers (for example WinLibs from winget) need it; MSVC is left alone.
if(WIN32 AND NOT MSVC)
  # MinGW defaults _WIN32_WINNT to an old Windows version, which hides APIs the engine's
  # HTTP server needs (CreateFile2 needs Windows 8). Target Windows 10.
  add_compile_definitions(_WIN32_WINNT=0x0A00 WINVER=0x0A00)
  # Link the MinGW runtime (libstdc++, libgcc, winpthread, OpenMP) into the program, so it
  # starts without the compiler's folder on PATH and cannot pick up another program's
  # copies of those DLLs (Git ships some).
  add_link_options(-static)
  # FindOpenMP links libgomp by full path and picks the DLL's import library, which would
  # still need libgomp-1.dll (and its libdl.dll). Point it at the static library instead,
  # also when an earlier configure cached the DLL choice.
  if(NOT OpenMP_gomp_LIBRARY OR OpenMP_gomp_LIBRARY MATCHES "\\.dll\\.a$")
    get_filename_component(_music_suite_mingw "${CMAKE_CXX_COMPILER}" DIRECTORY)
    get_filename_component(_music_suite_gomp "${_music_suite_mingw}/../lib/libgomp.a" ABSOLUTE)
    if(EXISTS "${_music_suite_gomp}")
      set(OpenMP_gomp_LIBRARY "${_music_suite_gomp}" CACHE FILEPATH "OpenMP library" FORCE)
    endif()
  endif()
  # WinLibs' static libgomp calls dlopen/dlerror, so libdl goes last on the link line.
  get_filename_component(_music_suite_mingw "${CMAKE_CXX_COMPILER}" DIRECTORY)
  if(OpenMP_gomp_LIBRARY MATCHES "libgomp\\.a$"
     AND (EXISTS "${_music_suite_mingw}/../x86_64-w64-mingw32/lib/libdl.a"
          OR EXISTS "${_music_suite_mingw}/../lib/libdl.a"))
    foreach(_music_suite_lang C CXX)
      if(NOT CMAKE_${_music_suite_lang}_STANDARD_LIBRARIES MATCHES "-ldl")
        string(APPEND CMAKE_${_music_suite_lang}_STANDARD_LIBRARIES " -ldl")
      endif()
    endforeach()
  endif()
endif()
