import avatarCreatorOne from './images/avatar_creator_one_1795066815825.jpg';
import heroNexoraWorkspace from './images/hero_nexora_workspace_1795066815506.jpg';
import spaceCoverBusiness from './images/space_cover_business_1795069803165.jpg';
import spaceCoverCode from './images/space_cover_code_1795066815138.jpg';
import spaceCoverDesign from './images/space_cover_design_1795066814901.jpg';
import spaceCoverEducation from './images/space_cover_education_1795069803375.jpg';
import spaceCoverLifestyle from './images/space_cover_lifestyle_1795069803396.jpg';
import spaceCoverSound from './images/space_cover_sound_1795066815582.jpg';

export const DEFAULT_ASSETS = {
  avatar: avatarCreatorOne,
  heroWorkspace: heroNexoraWorkspace,
  coverBusiness: spaceCoverBusiness,
  coverCode: spaceCoverCode,
  coverDesign: spaceCoverDesign,
  coverEducation: spaceCoverEducation,
  coverLifestyle: spaceCoverLifestyle,
  coverSound: spaceCoverSound,
} as const;

const LEGACY_ASSET_PATH_MAP: Record<string, string> = {
  '/src/assets/images/avatar_creator_one_1795066815825.jpg': avatarCreatorOne,
  '/src/assets/images/hero_nexora_workspace_1795066815506.jpg': heroNexoraWorkspace,
  '/src/assets/images/space_cover_business_1795069803165.jpg': spaceCoverBusiness,
  '/src/assets/images/space_cover_code_1795066815138.jpg': spaceCoverCode,
  '/src/assets/images/space_cover_design_1795066814901.jpg': spaceCoverDesign,
  '/src/assets/images/space_cover_education_1795069803375.jpg': spaceCoverEducation,
  '/src/assets/images/space_cover_lifestyle_1795069803396.jpg': spaceCoverLifestyle,
  '/src/assets/images/space_cover_sound_1795066815582.jpg': spaceCoverSound,
};

/**
 * Resolves legacy `/src/assets/images/...` paths (including values persisted in Firestore)
 * to Vite-bundled asset URLs while leaving remote HTTPS URLs and data URLs intact.
 */
export function resolveAssetUrl(src?: string | null): string {
  if (!src) return '';
  const trimmed = src.trim();
  if (!trimmed) return '';
  return LEGACY_ASSET_PATH_MAP[trimmed] || trimmed;
}
