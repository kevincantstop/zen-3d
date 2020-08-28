/**
 * @author jbouny / https://github.com/jbouny
 *
 * Work based on :
 * @author Slayvin / http://slayvin.net : Flat mirror for three.js
 * @author Stemkoski / http://www.adelphi.edu/~stemkoski : An implementation of water shader based on the flat mirror
 * @author Jonas Wagner / http://29a.ch/ && http://29a.ch/slides/2012/webglwater/ : Water shader explanations in WebGL
 */

import {
	Camera,
	Color3,
	DRAW_SIDE,
	Matrix4,
	Mesh,
	Plane,
	RenderTarget2D,
	ShaderMaterial,
	Vector3,
	Vector4,
	WEBGL_PIXEL_FORMAT,
	WEBGL_TEXTURE_FILTER
} from "../../../build/zen3d.module.js";

var Water = function(geometry, options) {
	var scope = this;

	options = options || {};

	var textureWidth = options.textureWidth !== undefined ? options.textureWidth : 512;
	var textureHeight = options.textureHeight !== undefined ? options.textureHeight : 512;

	var clipBias = options.clipBias !== undefined ? options.clipBias : 0.0;
	var alpha = options.alpha !== undefined ? options.alpha : 1.0;
	var time = options.time !== undefined ? options.time : 0.0;
	var normalSampler = options.waterNormals !== undefined ? options.waterNormals : null;
	var sunDirection = options.sunDirection !== undefined ? options.sunDirection : new Vector3(0.70707, 0.70707, 0.0);
	var sunColor = new Color3(options.sunColor !== undefined ? options.sunColor : 0xffffff);
	var waterColor = new Color3(options.waterColor !== undefined ? options.waterColor : 0x7F7F7F);
	var eye = options.eye !== undefined ? options.eye : new Vector3(0, 0, 0);
	var distortionScale = options.distortionScale !== undefined ? options.distortionScale : 20.0;
	var side = options.side !== undefined ? options.side : DRAW_SIDE.FRONT;

	//

	var mirrorPlane = new Plane();
	var normal = new Vector3();
	var mirrorWorldPosition = new Vector3();
	var cameraWorldPosition = new Vector3();
	var rotationMatrix = new Matrix4();
	var lookAtPosition = new Vector3(0, 0, -1);
	var clipPlane = new Vector4();

	var view = new Vector3();
	var target = new Vector3();
	var mirrorCameraUp = new Vector3();
	var q = new Vector4();

	var textureMatrix = new Matrix4();

	var mirrorCamera = new Camera();

	var renderTarget = new RenderTarget2D(textureWidth, textureHeight);
	renderTarget.texture.minFilter = WEBGL_TEXTURE_FILTER.LINEAR;
	renderTarget.texture.magFilter = WEBGL_TEXTURE_FILTER.LINEAR;
	renderTarget.texture.format = WEBGL_PIXEL_FORMAT.RGB;

	var mirrorShader = {
		uniforms: {
			u_FogColor: [1, 1, 1],
			u_FogDensity: 0.2,
			u_FogNear: 0.1,
			u_FogFar: 1000,

			normalSampler: null,
			mirrorSampler: null,
			alpha: 1.0,
			time: 0.0,
			size: 1.0,
			distortionScale: 20.0,
			textureMatrix: new Float32Array(16),
			sunColor: [0.8, 0.8, 0.8],
			sunDirection: [0.70707, 0.70707, 0],
			eye: [0, 0, 0],
			waterColor: [0.4, 0.4, 0.4]
		},

		vertexShader: [
			'uniform mat4 textureMatrix;',
			'uniform float time;',

			'varying vec4 mirrorCoord;',
			'varying vec4 worldPosition;',

			'#include <common_vert>',

			'void main() {',
			'	mirrorCoord = u_Model * vec4( a_Position, 1.0 );',
			'	worldPosition = mirrorCoord.xyzw;',
			'	mirrorCoord = textureMatrix * mirrorCoord;',
			'	vec4 mvPosition = u_View * u_Model * vec4( a_Position, 1.0 );',
			'	gl_Position = u_Projection * mvPosition;',
			'}'
		].join('\n'),

		fragmentShader: [
			'uniform sampler2D mirrorSampler;',
			'uniform float alpha;',
			'uniform float time;',
			'uniform float size;',
			'uniform float distortionScale;',
			'uniform sampler2D normalSampler;',
			'uniform vec3 sunColor;',
			'uniform vec3 sunDirection;',
			'uniform vec3 eye;',
			'uniform vec3 waterColor;',

			'varying vec4 mirrorCoord;',
			'varying vec4 worldPosition;',

			'vec4 getNoise( vec2 uv ) {',
			'	vec2 uv0 = ( uv / 103.0 ) + vec2(time / 17.0, time / 29.0);',
			'	vec2 uv1 = uv / 107.0-vec2( time / -19.0, time / 31.0 );',
			'	vec2 uv2 = uv / vec2( 8907.0, 9803.0 ) + vec2( time / 101.0, time / 97.0 );',
			'	vec2 uv3 = uv / vec2( 1091.0, 1027.0 ) - vec2( time / 109.0, time / -113.0 );',
			'	vec4 noise = texture2D( normalSampler, uv0 ) +',
			'		texture2D( normalSampler, uv1 ) +',
			'		texture2D( normalSampler, uv2 ) +',
			'		texture2D( normalSampler, uv3 );',
			'	return noise * 0.5 - 1.0;',
			'}',

			'void sunLight( const vec3 surfaceNormal, const vec3 eyeDirection, float shiny, float spec, float diffuse, inout vec3 diffuseColor, inout vec3 specularColor ) {',
			'	vec3 reflection = normalize( reflect( -sunDirection, surfaceNormal ) );',
			'	float direction = max( 0.0, dot( eyeDirection, reflection ) );',
			'	specularColor += pow( direction, shiny ) * sunColor * spec;',
			'	diffuseColor += max( dot( sunDirection, surfaceNormal ), 0.0 ) * sunColor * diffuse;',
			'}',

			'#include <fog_pars_frag>',

			'void main() {',
			'	vec4 noise = getNoise( worldPosition.xz * size );',
			'	vec3 surfaceNormal = normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) );',

			'	vec3 diffuseLight = vec3(0.0);',
			'	vec3 specularLight = vec3(0.0);',

			'	vec3 worldToEye = eye-worldPosition.xyz;',
			'	vec3 eyeDirection = normalize( worldToEye );',
			'	sunLight( surfaceNormal, eyeDirection, 100.0, 2.0, 0.5, diffuseLight, specularLight );',

			'	float distance = length(worldToEye);',

			'	vec2 distortion = surfaceNormal.xz * ( 0.001 + 1.0 / distance ) * distortionScale;',
			'	vec3 reflectionSample = vec3( texture2D( mirrorSampler, mirrorCoord.xy / mirrorCoord.w + distortion ) );',

			'	float theta = max( dot( eyeDirection, surfaceNormal ), 0.0 );',
			'	float rf0 = 0.3;',
			'	float reflectance = rf0 + ( 1.0 - rf0 ) * pow( ( 1.0 - theta ), 5.0 );',
			'	vec3 scatter = max( 0.0, dot( surfaceNormal, eyeDirection ) ) * waterColor;',
			'	vec3 albedo = mix( ( sunColor * diffuseLight * 0.3 + scatter ), ( vec3( 0.1 ) + reflectionSample * 0.9 + reflectionSample * specularLight ), reflectance);',
			'	vec3 outgoingLight = albedo;',
			'	gl_FragColor = vec4( outgoingLight, alpha );',

			'   #include <fog_frag>',
			'}'
		].join('\n')
	};

	var material = new ShaderMaterial(mirrorShader);
	material.side = side;

	material.uniforms["mirrorSampler"] = renderTarget.texture;
	material.uniforms["textureMatrix"] = textureMatrix.elements;
	material.uniforms["alpha"] = alpha;
	material.uniforms["time"] = time;
	material.uniforms["normalSampler"] = normalSampler;
	material.uniforms["sunColor"] = sunColor.toArray();
	material.uniforms["waterColor"] = waterColor.toArray();
	material.uniforms["sunDirection"] = sunDirection.toArray();
	material.uniforms["distortionScale"] = distortionScale;

	Mesh.call(scope, geometry, material);

	scope.updateReflect = function(glCore, scene, camera, sky) {
		mirrorWorldPosition.setFromMatrixPosition(scope.worldMatrix);
		cameraWorldPosition.setFromMatrixPosition(camera.worldMatrix);

		rotationMatrix.extractRotation(scope.worldMatrix);

		normal.set(0, 1, 0);
		normal.applyMatrix4(rotationMatrix);

		view.subVectors(mirrorWorldPosition, cameraWorldPosition);

		// Avoid rendering when mirror is facing away

		if (view.dot(normal) > 0) return;

		view.reflect(normal).negate();
		view.add(mirrorWorldPosition);

		rotationMatrix.extractRotation(camera.worldMatrix);

		lookAtPosition.set(0, 0, -1);
		lookAtPosition.applyMatrix4(rotationMatrix);
		lookAtPosition.add(cameraWorldPosition);

		target.subVectors(mirrorWorldPosition, lookAtPosition);
		target.reflect(normal).negate();
		target.add(mirrorWorldPosition);

		mirrorCamera.position.copy(view);
		mirrorCameraUp.set(0, 1, 0);
		mirrorCameraUp.applyMatrix4(rotationMatrix);
		mirrorCameraUp.reflect(normal);
		mirrorCamera.lookAt(target, mirrorCameraUp);

		mirrorCamera.updateMatrix();
		mirrorCamera.projectionMatrix.copy(camera.projectionMatrix);

		// Update the texture matrix
		textureMatrix.set(
			0.5, 0.0, 0.0, 0.5,
			0.0, 0.5, 0.0, 0.5,
			0.0, 0.0, 0.5, 0.5,
			0.0, 0.0, 0.0, 1.0
		);
		textureMatrix.multiply(mirrorCamera.projectionMatrix);
		textureMatrix.multiply(mirrorCamera.viewMatrix);

		// Now update projection matrix with new clip plane, implementing code from: http://www.terathon.com/code/oblique.html
		// Paper explaining this technique: http://www.terathon.com/lengyel/Lengyel-Oblique.pdf
		mirrorPlane.setFromNormalAndCoplanarPoint(normal, mirrorWorldPosition);
		mirrorPlane.applyMatrix4(mirrorCamera.viewMatrix);

		clipPlane.set(mirrorPlane.normal.x, mirrorPlane.normal.y, mirrorPlane.normal.z, mirrorPlane.constant);

		var projectionMatrix = mirrorCamera.projectionMatrix;

		q.x = (Math.sign(clipPlane.x) + projectionMatrix.elements[8]) / projectionMatrix.elements[0];
		q.y = (Math.sign(clipPlane.y) + projectionMatrix.elements[9]) / projectionMatrix.elements[5];
		q.z = -1.0;
		q.w = (1.0 + projectionMatrix.elements[10]) / projectionMatrix.elements[14];

		// Calculate the scaled plane vector
		clipPlane.multiplyScalar(2.0 / clipPlane.dot(q));

		// Replacing the third row of the projection matrix
		projectionMatrix.elements[2] = clipPlane.x;
		projectionMatrix.elements[6] = clipPlane.y;
		projectionMatrix.elements[10] = clipPlane.z + 1.0 - clipBias;
		projectionMatrix.elements[14] = clipPlane.w;

		eye.setFromMatrixPosition(camera.worldMatrix);
		eye.toArray(material.uniforms["eye"]);

		scope.visible = false;
		scene.add(mirrorCamera);

		if (sky) {
			var skyParent = sky.parent;
			skyParent.remove(sky);
			mirrorCamera.add(sky);
		}

		scene.updateMatrix();

		glCore.renderTarget.setRenderTarget(renderTarget);

		glCore.state.colorBuffer.setClear(0, 0, 0, 0);
		glCore.clear(true, true, true);

		glCore.render(scene, mirrorCamera, true);

		scope.visible = true;
		scene.remove(mirrorCamera);

		if (sky) {
			mirrorCamera.remove(sky);
			skyParent.add(sky);
		}
	};
};

Water.prototype = Object.create(Mesh.prototype);
Water.prototype.constructor = Water;

export { Water };