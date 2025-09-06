FROM ilharp/cordis-base:1.0.0

WORKDIR /cordis
COPY . /cordis
RUN ["corepack", "yarn"]
RUN ["corepack", "yarn", "build"]
# RUN ["corepack", "yarn", "node", "-r", "esbuild-register", "scripts/prepare.mts"]
RUN ["rm", "-rf", "node_modules"]

FROM ilharp/cordis-base:1.0.0

WORKDIR /cordis
COPY --from=0 /cordis /cordis
RUN ["corepack", "yarn"]
