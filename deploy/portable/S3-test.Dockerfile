# Disposable S3 protocol acceptance only; no external storage account.
# Build a pinned upstream release because public prebuilt registries may require access.
FROM golang:1.25-bookworm AS build
ENV CGO_ENABLED=0
RUN GOBIN=/out go install -trimpath github.com/minio/minio@RELEASE.2025-10-15T17-29-55Z
FROM debian:bookworm-slim
COPY --from=build /out/minio /usr/local/bin/minio
RUN mkdir /data && chown 65532:65532 /data
USER 65532:65532
ENTRYPOINT ["/usr/local/bin/minio"]
CMD ["server", "/data"]
