import { Request, Response } from 'express';
import { getAdminUiConfig, getBookingTimingConfig } from '../config/uiConfig';
import UiAsset from '../models/uiAsset';

const normalizeHallImageUrls = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  const cleaned = raw
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  return Array.from(new Set(cleaned)).slice(0, 12);
};

const normalizeLogo = (raw: unknown): string => {
  return typeof raw === 'string' ? raw : '';
};

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

  public getUiAssets = async (_req: Request, res: Response): Promise<void> => {
    try {
      const settingsDoc = await UiAsset.findById('global').lean();
      res.status(200).json({
        message: 'UI assets fetched successfully',
        settings: {
          hallImageUrls: normalizeHallImageUrls(settingsDoc?.hallImageUrls || []),
          adminLogoUrl: normalizeLogo(settingsDoc?.adminLogoUrl)
        }
      });
    } catch (error: any) {
      res.status(500).json({
        message: 'Unable to fetch UI assets',
        error: error.message
      });
    }
  };

  public updateUiAssets = async (req: Request, res: Response): Promise<void> => {
    try {
      const body = (req.body || {}) as {
        hallImageUrls?: unknown;
        adminLogoUrl?: unknown;
      };
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

      const updatePayload: {
        hallImageUrls?: string[];
        adminLogoUrl?: string;
      } = {};
      if (hasHallImageUrls) {
        updatePayload.hallImageUrls = normalizeHallImageUrls(body.hallImageUrls);
      }
      if (hasAdminLogoUrl) {
        updatePayload.adminLogoUrl = typeof body.adminLogoUrl === 'string' ? body.adminLogoUrl.trim() : '';
      }

      const updated = await UiAsset.findByIdAndUpdate(
        'global',
        { $set: updatePayload },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      ).lean();

      res.status(200).json({
        message: 'UI assets updated successfully',
        settings: {
          hallImageUrls: normalizeHallImageUrls(updated?.hallImageUrls || []),
          adminLogoUrl: normalizeLogo(updated?.adminLogoUrl)
        }
      });
    } catch (error: any) {
      res.status(500).json({
        message: 'Unable to update UI assets',
        error: error.message
      });
    }
  };
}

export default new SettingsController();
