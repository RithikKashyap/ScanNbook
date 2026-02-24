import { Request, Response } from 'express';
import { getAdminUiConfig, getBookingTimingConfig } from '../config/uiConfig';

class SettingsController {
  public getAdminLoginSettings = async (_req: Request, res: Response): Promise<void> => {
    const adminUi = getAdminUiConfig();
    const bookingTiming = getBookingTimingConfig();

    res.status(200).json({
      message: 'Admin login settings fetched successfully',
      settings: {
        adminUi,
        bookingTiming
      }
    });
  };
}

export default new SettingsController();
