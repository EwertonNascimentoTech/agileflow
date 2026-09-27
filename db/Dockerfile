# Postgres do AgileFlow: a MESMA postgres:16-alpine de antes + pgvector compilado.
#
# Não trocar por pgvector/pgvector:pg16 (Debian/glibc): o banco usa collation en_US.utf8 do
# libc do Alpine (musl) e a ordenação de texto muda no glibc — os índices de texto já gravados
# (e-mail único, slugs...) ficariam inconsistentes sem erro. Aqui SO, versão e collation são
# os mesmos; só ganha a extensão (que nem é criada até VECTOR_ENABLED=true).
FROM postgres:16-alpine

ARG PGVECTOR_VERSION=0.8.0

# OPTFLAGS="": sem -march=native, o binário roda em qualquer CPU (build numa máquina, deploy noutra).
# with_llvm=no: sem bitcode para JIT (o banco roda com jit=off; dispensa clang/llvm no build).
RUN apk add --no-cache --virtual .build-deps build-base \
    && wget -qO- "https://github.com/pgvector/pgvector/archive/refs/tags/v${PGVECTOR_VERSION}.tar.gz" | tar -xz -C /tmp \
    && cd "/tmp/pgvector-${PGVECTOR_VERSION}" \
    && make OPTFLAGS="" with_llvm=no \
    && make install with_llvm=no \
    && cd / && rm -rf "/tmp/pgvector-${PGVECTOR_VERSION}" \
    && apk del .build-deps
