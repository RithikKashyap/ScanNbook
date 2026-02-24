"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const uiConfig_1 = require("../config/uiConfig");
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
    }
}
exports.default = new SettingsController();
//# sourceMappingURL=settingsController.js.map