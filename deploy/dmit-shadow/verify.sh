#!/usr/bin/env bash
# Confirm the DMIT proxy honours each client's Accept-Encoding for build assets.
# Every row must show enc matching what the client can accept (identity for
# clients that accept nothing) and a decodable body.
set -uo pipefail
HOST="${1:-miemieaowu.ai}"
TMP=$(mktemp -d)
HTML="$TMP/home.html"
curl -sS "https://$HOST/" -o "$HTML"
CSS=$(grep -oE '/_next/static/chunks/[^"]+\.css' "$HTML" | head -1)
echo "stylesheet: $CSS"
fail=0
for enc in "" "gzip" "br" "zstd" "gzip, deflate, br, zstd"; do
  curl -sS -D "$TMP/h" -o "$TMP/b" -H "Accept-Encoding: $enc" "https://$HOST$CSS"
  got=$(grep -i '^content-encoding' "$TMP/h" | tr -d '\r' | awk '{print $2}')
  shadow=$(grep -i '^x-shadow-cache' "$TMP/h" | tr -d '\r' | awk '{print $2}')
  alt=$(grep -ic '^alt-svc' "$TMP/h")
  case "${got:-identity}" in
    identity) ok=$(head -c 1 "$TMP/b" | grep -q '[@.:a-zA-Z{]' && echo yes || echo no) ;;
    gzip)     ok=$(gzip -dc "$TMP/b" >/dev/null 2>&1 && echo yes || echo no) ;;
    *)        ok=no ;;
  esac
  [ "$ok" = yes ] || fail=1
  [ "$alt" = 0 ] || { echo "  alt-svc still leaking"; fail=1; }
  printf 'accept=%-26s enc=%-8s shadow=%-7s decodable=%s\n' "'$enc'" "${got:-identity}" "$shadow" "$ok"
done
rm -rf "$TMP"
[ $fail = 0 ] && echo "OK" || { echo "FAIL"; exit 1; }
