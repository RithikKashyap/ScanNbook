import { Document, Schema, model } from 'mongoose';

export interface IUiAsset extends Document {
  _id: string;
  hallImageUrls: string[];
  adminLogoUrl: string;
  createdAt: Date;
  updatedAt: Date;
}

const uiAssetSchema = new Schema<IUiAsset>(
  {
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
  },
  {
    timestamps: true
  }
);

const UiAsset = model<IUiAsset>('UiAsset', uiAssetSchema);

export default UiAsset;
