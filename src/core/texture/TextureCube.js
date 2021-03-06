import { TextureBase } from './TextureBase.js';
import { WEBGL_TEXTURE_TYPE, WEBGL_PIXEL_FORMAT, TEXEL_ENCODING_TYPE } from '../const.js';
import { ImageLoader } from '../loader/ImageLoader.js';
import { TGALoader } from '../loader/TGALoader.js';
import { RGBELoader } from '../loader/RGBELoader.js';

/**
 * Creates a cube texture made up of six images.
 * @constructor
 * @memberof zen3d
 * @extends zen3d.TextureBase
 */
function TextureCube() {
	TextureBase.call(this);

	this.textureType = WEBGL_TEXTURE_TYPE.TEXTURE_CUBE_MAP;

	/**
     * Images data for this texture.
     * @member {HTMLImageElement[]}
     * @default []
     */
	this.images = [];

	/**
     * @default false
     */
	this.flipY = false;
}

TextureCube.prototype = Object.assign(Object.create(TextureBase.prototype), /** @lends zen3d.TextureCube.prototype */{

	constructor: TextureCube,

	copy: function(source) {
		TextureBase.prototype.copy.call(this, source);

		this.images = source.images.slice(0);

		return this;
	}

});

/**
 * Create TextureCube from images.
 * @param {HTMLImageElement[]} imageArray
 * @return {TextureCube} - The result Texture.
 */
TextureCube.fromImage = function(imageArray) {
	var texture = new TextureCube();
	var images = texture.images;

	for (var i = 0; i < 6; i++) {
		images[i] = imageArray[i];
	}

	texture.version++;

	return texture;
}

/**
 * Create TextureCube from src array.
 * @param {string[]} srcArray
 * @return {TextureCube} - The result Texture.
 */
TextureCube.fromSrc = function(srcArray) {
	var texture = new TextureCube();
	var images = texture.images;

	var src = srcArray[0];
	// JPEGs can't have an alpha channel, so memory can be saved by storing them as RGB.
	var isJPEG = src.search(/\.(jpg|jpeg)$/) > 0 || src.search(/^data\:image\/jpeg/) === 0;

	var isTGA = src.search(/\.(tga)$/) > 0 || src.search(/^data\:image\/tga/) === 0;

	var isHDR = src.search(/\.(hdr)$/) > 0;

	var loader;
	if (isHDR) {
		loader = new RGBELoader();
	} else {
		loader = isTGA ? new TGALoader() : new ImageLoader();
	}

	var count = 0;
	function next(image) {
		if (image) {
			if (isHDR) {
				images.push({ data: image.data, width: image.width, height: image.height });
			} else {
				images.push(image);
			}
			count++;
		}
		if (count >= 6) {
			loaded(isHDR ? image : undefined);
			return;
		}
		loader.load(srcArray[count], next);
	}
	next();

	function loaded(imageData) {
		if (imageData) {
			texture.encoding = TEXEL_ENCODING_TYPE.RGBE;
			texture.type = imageData.type;
			texture.format = imageData.format;
		} else {
			texture.format = isJPEG ? WEBGL_PIXEL_FORMAT.RGB : WEBGL_PIXEL_FORMAT.RGBA;
		}

		texture.version++;
		texture.dispatchEvent({ type: 'onload' });
	}

	return texture;
}

export { TextureCube };