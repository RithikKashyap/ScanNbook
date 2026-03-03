"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const uiConfig_1 = require("../config/uiConfig");
const uiAsset_1 = __importDefault(require("../models/uiAsset"));
const normalizeHallImageUrls = (raw) => {
    if (!Array.isArray(raw))
        return [];
    const cleaned = raw
        .map((item) => String(item || '').trim())
        .filter(Boolean);
    return Array.from(new Set(cleaned)).slice(0, 12);
};
const normalizeLogo = (raw) => {
    return typeof raw === 'string' ? raw : '';
};
class SettingsController {
    constructor() {
        this.getAdminLoginSettings = async (_req, res) => {
            const adminUi = (0, uiConfig_1.getAdminUiConfig)();
            const bookingTiming = (0, uiConfig_1.getBookingTimingConfig)();
            res.status(200).json({
                message: 'Admin login settings fetched successfully',
                settings: {
                    adminUi,
                    bookingTiming
                }
            });
        };
        this.getUiAssets = async (_req, res) => {
            try {
                const settingsDoc = await uiAsset_1.default.findById('global').lean();
                res.status(200).json({
                    message: 'UI assets fetched successfully',
                    settings: {
                        hallImageUrls: normalizeHallImageUrls(settingsDoc?.hallImageUrls || []),
                        adminLogoUrl: normalizeLogo(settingsDoc?.adminLogoUrl)
                    }
                });
            }
            catch (error) {
                res.status(500).json({
                    message: 'Unable to fetch UI assets',
                    error: error.message
                });
            }
        };
        this.updateUiAssets = async (req, res) => {
            try {
                const body = (req.body || {});
                const hasHallImageUrls = Object.prototype.hasOwnProperty.call(body, 'hallImageUrls');
                const hasAdminLogoUrl = Object.prototype.hasOwnProperty.call(body, 'adminLogoUrl');
                if (!hasHallImageUrls && !hasAdminLogoUrl) {
                    res.status(400).json({ message: 'hallImageUrls or adminLogoUrl is required' });
                    return;
                }
                if (hasHallImageUrls && !Array.isArray(body.hallImageUrls)) {
                    res.status(400).json({ message: 'hallImageUrls must be an array' });
                    return;
                }
                if (hasAdminLogoUrl && body.adminLogoUrl !== null && typeof body.adminLogoUrl !== 'string') {
                    res.status(400).json({ message: 'adminLogoUrl must be a string' });
                    return;
                }
                const updatePayload = {};
                if (hasHallImageUrls) {
                    updatePayload.hallImageUrls = normalizeHallImageUrls(body.hallImageUrls);
                }
                if (hasAdminLogoUrl) {
                    updatePayload.adminLogoUrl = typeof body.adminLogoUrl === 'string' ? body.adminLogoUrl.trim() : '';
                }
                const updated = await uiAsset_1.default.findByIdAndUpdate('global', { $set: updatePayload }, { new: true, upsert: true, setDefaultsOnInsert: true }).lean();
                res.status(200).json({
                    message: 'UI assets updated successfully',
                    settings: {
                        hallImageUrls: normalizeHallImageUrls(updated?.hallImageUrls || []),
                        adminLogoUrl: normalizeLogo(updated?.adminLogoUrl)
                    }
                });
            }
            catch (error) {
                res.status(500).json({
                    message: 'Unable to update UI assets',
                    error: error.message
                });
            }
        };
    }
}
exports.default = new SettingsController();
//# sourceMappingURL=settingsController.js.map