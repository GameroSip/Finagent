import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Lo que genera `npx cap add android` (Capacitor 8): el script tiene que poder prepararlo para Google Play.
const TEMPLATE = `apply plugin: 'com.android.application'

android {
    namespace = "com.finagent.app"
    compileSdk = rootProject.ext.compileSdkVersion
    defaultConfig {
        applicationId "com.finagent.app"
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 1
        versionName "1.0"
    }
    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
`;
const run = (file: string, code: string, name: string) => spawnSync('python3', ['scripts/android-release-config.py', file, code, name], { encoding: 'utf8' });
const fresh = () => { const f = join(mkdtempSync(join(tmpdir(), 'gradle-')), 'build.gradle'); writeFileSync(f, TEMPLATE); return f; };

describe('configuración de lanzamiento para Google Play', () => {
  it('pone la versión (código creciente y nombre) y firma con la clave de subida, leyendo las contraseñas del entorno', () => {
    const f = fresh(), r = run(f, '42', '0.11.0'), s = readFileSync(f, 'utf8');
    expect(r.status).toBe(0);
    expect(s).toMatch(/versionCode 42\b/); expect(s).toMatch(/versionName "0\.11\.0"/);
    expect(s).toMatch(/signingConfigs \{\s*release \{/); expect(s).toContain("storeFile file(System.getenv('KEYSTORE_PATH'))"); expect(s).toContain("storePassword System.getenv('KEYSTORE_PASSWORD')");
    expect(s).toMatch(/release \{\s*signingConfig signingConfigs\.release/);
  });
  it('NUNCA escribe una contraseña en el archivo (aunque estén en el entorno)', () => {
    const f = fresh(); execFileSync('python3', ['scripts/android-release-config.py', f, '5', '0.11.0'], { env: { ...process.env, KEYSTORE_PASSWORD: 'SECRETISIMA-123', KEY_PASSWORD: 'OTRA-SECRETA-456' } });
    const s = readFileSync(f, 'utf8'); expect(s).not.toContain('SECRETISIMA-123'); expect(s).not.toContain('OTRA-SECRETA-456');
  });
  it('es idempotente: correrlo dos veces no duplica la firma y actualiza la versión', () => {
    const f = fresh(); run(f, '1', '0.11.0'); expect(run(f, '2', '0.11.1').status).toBe(0);
    const s = readFileSync(f, 'utf8'); expect((s.match(/signingConfigs \{/g) ?? []).length).toBe(1); expect((s.match(/signingConfig signingConfigs\.release/g) ?? []).length).toBe(1); expect(s).toMatch(/versionCode 2\b/); expect(s).toMatch(/versionName "0\.11\.1"/);
  });
  it('rechaza versiones inválidas y proyectos que no reconoce, sin tocar el archivo', () => {
    const f = fresh();
    for (const [c, n] of [['0', '0.11.0'], ['abc', '0.11.0'], ['3', '0.11'], ['3', 'v0.11.0']]) expect(run(f, c, n).status, `${c} ${n}`).not.toBe(0);
    expect(readFileSync(f, 'utf8')).toBe(TEMPLATE);
    const g = join(mkdtempSync(join(tmpdir(), 'gradle-')), 'build.gradle'); writeFileSync(g, 'android { }'); expect(run(g, '3', '0.11.0').status).not.toBe(0);
  });
  it('el workflow del AAB usa el script, pide los 4 secretos y la variable API_BASE, y el modo prueba no sirve para subir', () => {
    const w = readFileSync('.github/workflows/release-aab.yml', 'utf8');
    for (const s of ['ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD', 'vars.API_BASE', 'bundleRelease', 'android-release-config.py', 'finagent-aab', 'no-subir', 'add-mask']) expect(w).toContain(s);
    for (const m of w.matchAll(/-(?:store|key)pass\s+(\S+)/g)) expect(m[1], 'contraseña escrita en el workflow').toBe('prueba123');      // la única contraseña escrita es la de la clave descartable del modo prueba
  });
});
