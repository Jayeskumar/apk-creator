# syntax=docker/dockerfile:1.7
#
# APK Creator images
#   --target server   API + web UI only (cloud API pods; builds run elsewhere)
#   --target builder  API + web UI + Android build toolchain (default)
#                     Use it for the all-in-one on-premise box and for build workers.
#
# The builder image pre-warms the Gradle cache by compiling the Android
# template once, so builds work fully offline (GRADLE_OFFLINE=true) in
# air-gapped on-premise installations.

ARG NODE_VERSION=22

# ---------------------------------------------------------------- server
FROM node:${NODE_VERSION}-bookworm-slim AS server
ENV NODE_ENV=production \
    APP_HOME=/opt/apk-creator \
    DATA_DIR=/data \
    PORT=8080
WORKDIR /opt/apk-creator
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server/src ./server/src
COPY runtime ./runtime
COPY web ./web
COPY templates ./templates
COPY android-template ./android-template
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "server/src/index.js"]

# ---------------------------------------------------------------- builder
FROM server AS builder
USER root
ARG ANDROID_CMDLINE_TOOLS=13114758
ARG ANDROID_PLATFORM=35
ARG ANDROID_BUILD_TOOLS=35.0.0
ARG GRADLE_VERSION=8.14.3
ENV ANDROID_HOME=/opt/android-sdk \
    ANDROID_SDK_ROOT=/opt/android-sdk \
    GRADLE_HOME=/opt/gradle \
    GRADLE_USER_HOME=/opt/gradle-cache \
    GRADLE_CMD=/opt/gradle/bin/gradle \
    JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
ENV PATH=$PATH:/opt/gradle/bin:/opt/android-sdk/cmdline-tools/latest/bin

RUN apt-get update \
 && apt-get install -y --no-install-recommends openjdk-17-jdk-headless unzip curl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && JAVA_DIR="$(dirname "$(dirname "$(readlink -f "$(command -v javac)")")")" \
 && [ "$JAVA_DIR" = "$JAVA_HOME" ] || ln -s "$JAVA_DIR" "$JAVA_HOME"

RUN curl -fsSL -o /tmp/tools.zip "https://dl.google.com/android/repository/commandlinetools-linux-${ANDROID_CMDLINE_TOOLS}_latest.zip" \
 && mkdir -p "$ANDROID_HOME/cmdline-tools" \
 && unzip -q /tmp/tools.zip -d /tmp/tools && mv /tmp/tools/cmdline-tools "$ANDROID_HOME/cmdline-tools/latest" \
 && rm -rf /tmp/tools /tmp/tools.zip \
 && yes | sdkmanager --licenses > /dev/null \
 && sdkmanager --install "platforms;android-${ANDROID_PLATFORM}" "build-tools;${ANDROID_BUILD_TOOLS}" > /dev/null \
 && rm -rf "$ANDROID_HOME/emulator" "$ANDROID_HOME/.temp"

RUN curl -fsSL -o /tmp/gradle.zip "https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip" \
 && unzip -q /tmp/gradle.zip -d /opt && mv "/opt/gradle-${GRADLE_VERSION}" /opt/gradle && rm /tmp/gradle.zip

# Pre-warm: compile the template once so AGP and its dependencies are cached.
RUN cp -r /opt/apk-creator/android-template /tmp/warm \
 && gradle -p /tmp/warm --no-daemon --console=plain -q assembleRelease \
 && rm -rf /tmp/warm \
 && chown -R node:node "$GRADLE_USER_HOME" /data

USER node
CMD ["node", "--disable-warning=ExperimentalWarning", "server/src/index.js"]
