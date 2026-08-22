#!/usr/bin/env bash
# Toolchain for the Android build.
#
#   . scripts/android-env.sh && pnpm android:build
#
# Every value can be overridden from the outside; the defaults match a plain
# `sdkmanager` install, so a machine that already has the SDK configured needs
# no changes here.

export ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"

# Pick the newest installed NDK unless one was named explicitly.
if [ -z "${NDK_HOME:-}" ]; then
  NDK_HOME="$(ls -d "$ANDROID_HOME"/ndk/* 2>/dev/null | sort -V | tail -1)"
fi
export NDK_HOME
export ANDROID_NDK_ROOT="$NDK_HOME"

# Tauri's Gradle build needs a JDK; derive it from whatever javac is on PATH.
if [ -z "${JAVA_HOME:-}" ] && command -v javac >/dev/null 2>&1; then
  JAVA_HOME="$(dirname "$(dirname "$(readlink -f "$(command -v javac)")")")"
  export JAVA_HOME
fi

export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

if [ ! -d "$NDK_HOME" ]; then
  echo "NDK не найден в $ANDROID_HOME/ndk — установите его:" >&2
  echo "  sdkmanager 'ndk;27.3.13750724'" >&2
fi
