// CTScanClear's chapters, in reading order.
import anatomy from './anatomy.js';
import slices from './slices.js';
import recon from './recon.js';
import hounsfield from './hounsfield.js';
import dose from './dose.js';
import modern from './modern.js';

export const BOX = { slug: 'ctscanclear', title: 'CTScanClear' };
export const CHAPTERS = [anatomy, slices, recon, hounsfield, dose, modern];
