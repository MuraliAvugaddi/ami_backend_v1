// =====================================================================
// Cloudinary upload helper for payment screenshots.
// Needs CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.
// =====================================================================
const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
});

const isConfigured = () =>
    Boolean(
        process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET
    );

/**
 * Uploads a base64 image and returns { url, publicId }.
 * @param {string} base64 - raw base64 (no data: prefix) or a full data URI
 * @param {string} folder - e.g. "chef-payments/2026-10"
 * @param {string} publicId - file name without extension
 */
const uploadBase64Image = async (base64, folder, publicId) => {
    if (!isConfigured()) {
        throw new Error('Image storage is not configured on the server (Cloudinary keys missing).');
    }
    const dataUri = base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
    const result = await cloudinary.uploader.upload(dataUri, {
        folder,
        public_id: publicId,
        overwrite: false,
        unique_filename: true,
        resource_type: 'image',
        // Shrink large phone screenshots so they load fast in the admin panel
        transformation: [{ width: 1400, crop: 'limit', quality: 'auto' }],
    });
    return { url: result.secure_url, publicId: result.public_id };
};

module.exports = { uploadBase64Image, isCloudinaryConfigured: isConfigured };
