import * as THREE from 'three';
import { SUN_DIRECTION } from './three-palette';

/**
 * Gradient sky dome for the commune. Always visible (both top-down and
 * first-person), graded from the shared palette, with a sun disc by day and
 * procedural stars at night. ShaderMaterial ignores scene fog — the fragment
 * horizon colors must stay close to the fog palette colors.
 */
export function createSkyMaterial(): THREE.ShaderMaterial {
  const sunDir = new THREE.Vector3(SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z).normalize();
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      night: { value: 0 },
      sunDirection: { value: sunDir },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float night;
      uniform vec3 sunDirection;
      varying vec3 vDirection;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      void main() {
        vec3 dir = normalize(vDirection);
        float gradient = smoothstep(-0.06, 0.66, dir.y);

        vec3 dayHorizon = vec3(0.78, 0.84, 0.77);
        vec3 dayZenith = vec3(0.20, 0.43, 0.66);
        vec3 nightHorizon = vec3(0.10, 0.16, 0.25);
        vec3 nightZenith = vec3(0.025, 0.055, 0.12);
        vec3 color = mix(
          mix(dayHorizon, dayZenith, gradient),
          mix(nightHorizon, nightZenith, gradient),
          night
        );

        // Sun disc + halo (day only).
        float sunAmount = max(dot(dir, sunDirection), 0.0);
        float disc = smoothstep(0.9982, 0.9993, sunAmount);
        float halo = pow(sunAmount, 160.0) * 0.32;
        color += (disc * 0.9 + halo) * (1.0 - night) * vec3(1.0, 0.93, 0.78);

        // Stars (night only): sparse bright points on a coarse directional grid.
        if (night > 0.05 && dir.y > 0.02) {
          vec2 uv = vec2(atan(dir.z, dir.x) * 10.0, dir.y * 24.0);
          vec2 cell = floor(uv);
          vec2 f = fract(uv);
          float h = hash(cell);
          vec2 starPos = vec2(fract(h * 13.73), fract(h * 7.31)) * 0.6 + 0.2;
          float dist = length(f - starPos);
          float twinkle = 0.75 + 0.25 * sin(h * 61.6);
          float star = smoothstep(0.10, 0.0, dist) * step(0.86, h) * night * twinkle;
          color += vec3(star * 0.9);
        }

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
}
