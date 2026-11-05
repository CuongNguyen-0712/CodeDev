# @piece runtime-copy: Copy only what the server needs from the build stage
COPY --from=build /app ./
