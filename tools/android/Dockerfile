# Isolated Android toolchain for Blednify: JDK 17 + Android cmdline-tools + Node 24 + Bun.
# The SDK lives in a bind-mounted host dir (default ~/Android/Sdk) so the host emulator
# and T3 device panel can use the same packages without installing anything system-wide.
FROM eclipse-temurin:17-jdk-noble
ARG CMDLINE_TOOLS=9862592
ENV ANDROID_HOME=/sdk ANDROID_SDK_ROOT=/sdk \
    PATH=/opt/cmdline-tools/bin:/sdk/platform-tools:$PATH \
    GRADLE_USER_HOME=/gradle
RUN apt-get update && apt-get install -y --no-install-recommends unzip curl git ca-certificates xz-utils python3 \
    libx11-6 libxext6 libxrender1 libxcomposite1 libxcursor1 libxi6 libxtst6 libxdamage1 libxrandr2 libxfixes3 \
    libxkbfile1 libxkbcommon0 libxkbcommon-x11-0 libxcb1 libxcb-xinerama0 libxcb-cursor0 libnss3 libpulse0 libasound2t64 \
    libgl1 libegl1 libdrm2 libgbm1 libdbus-1-3 libbsd0 libfontconfig1 libfreetype6 libtinfo6 libuuid1 \
 && rm -rf /var/lib/apt/lists/* \
 && curl -fsSL https://dl.google.com/android/repository/commandlinetools-linux-${CMDLINE_TOOLS}_latest.zip -o /tmp/ct.zip \
 && unzip -q /tmp/ct.zip -d /opt && rm /tmp/ct.zip \
 && curl -fsSL https://nodejs.org/dist/v24.11.0/node-v24.11.0-linux-x64.tar.xz | tar -xJ -C /usr/local --strip-components=1 \
 && curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash && chmod -R a+rX /opt /usr/local
WORKDIR /work
