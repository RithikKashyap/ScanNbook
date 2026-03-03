"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const uiAssetSchema = new mongoose_1.Schema({
    _id: {
        type: String,
        default: 'global'
    },
    hallImageUrls: {
        type: [String],
        default: []
    },
    adminLogoUrl: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});
const UiAsset = (0, mongoose_1.model)('UiAsset', uiAssetSchema);
exports.default = UiAsset;
//# sourceMappingURL=uiAsset.js.map