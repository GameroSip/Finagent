#!/usr/bin/env python3
"""Prepara android/app/build.gradle para un paquete de lanzamiento: versión (versionCode siempre creciente, versionName = versión de la app)
y firma con la clave de subida. Las contraseñas NO se escriben en el archivo: se leen de variables de entorno al compilar.
Uso: android-release-config.py <build.gradle> <versionCode> <versionName>"""
import re, sys

path, code, name = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(path, encoding="utf-8").read()
assert code.isdigit() and int(code) >= 1, "versionCode inválido"
assert re.fullmatch(r"\d+\.\d+\.\d+", name), "versionName inválido"

s, n1 = re.subn(r"versionCode\s+\d+", f"versionCode {code}", s, count=1)
s, n2 = re.subn(r'versionName\s+"[^"]*"', f'versionName "{name}"', s, count=1)
if n1 != 1 or n2 != 1: sys.exit("No encontré versionCode/versionName en build.gradle")

SIGNING = """    signingConfigs {
        release {
            storeFile file(System.getenv('KEYSTORE_PATH'))
            storePassword System.getenv('KEYSTORE_PASSWORD')
            keyAlias System.getenv('KEY_ALIAS')
            keyPassword System.getenv('KEY_PASSWORD')
        }
    }
"""
if "signingConfigs" not in s:
    s, n3 = re.subn(r"(\n    buildTypes \{)", "\n" + SIGNING.rstrip("\n") + r"\n\1", s, count=1)
    if n3 != 1: sys.exit("No encontré buildTypes en build.gradle")
if "signingConfig signingConfigs.release" not in s:
    s, n4 = re.subn(r"(buildTypes \{\s*release \{)", r"\1\n            signingConfig signingConfigs.release", s, count=1)
    if n4 != 1: sys.exit("No encontré el tipo release en build.gradle")
open(path, "w", encoding="utf-8").write(s)
print(f"build.gradle listo: versionCode {code}, versionName {name}, firma de lanzamiento por variables de entorno")
