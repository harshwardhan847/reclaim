export type SafetyLevel = 'safe' | 'caution' | 'risky';

export interface SafetyInfo {
  level: SafetyLevel;
  label: string;
  reason: string;
}

const SAFE_DUPLICATE: SafetyInfo = {
  level: 'safe',
  label: 'Safe',
  reason: 'An extra copy of a file that exists elsewhere. The original is always kept.',
};

const SAFE_AI_CACHE: SafetyInfo = {
  level: 'safe',
  label: 'Safe',
  reason: 'A cache file. It regenerates automatically the next time the tool needs it.',
};

function safeDevCleanup(category: string): SafetyInfo {
  return {
    level: 'safe',
    label: 'Safe',
    reason: `A build artifact (${category}). Rebuilds automatically on your next build or install.`,
  };
}

const INSTALLER_EXTS = new Set(['.dmg', '.pkg', '.iso']);
const ARCHIVE_EXTS = new Set(['.zip', '.tar', '.gz', '.tgz', '.rar', '.7z']);
const PERSONAL_CONTENT_EXTS = new Set([
  '.mov', '.mp4', '.mkv', '.avi', // video
  '.psd', '.ai', '.sketch', '.fig', // design source files
  '.doc', '.docx', '.pages', '.key', '.numbers', '.pdf', // documents
  '.pkg.tar', '.vmdk', '.vdi', '.qcow2', // VM disks
]);

function extOf(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx === -1 ? '' : name.slice(idx).toLowerCase();
}

export function classifyLargeFile(path: string, name: string): SafetyInfo {
  const lowerPath = path.toLowerCase();
  const ext = extOf(name);
  const isInDownloads = lowerPath.includes('/downloads/');

  if (isInDownloads && (INSTALLER_EXTS.has(ext) || ARCHIVE_EXTS.has(ext))) {
    return {
      level: 'caution',
      label: 'Likely unused',
      reason: "An installer or archive sitting in Downloads -- probably already used, but double-check before deleting.",
    };
  }

  if (PERSONAL_CONTENT_EXTS.has(ext)) {
    return {
      level: 'risky',
      label: 'Review first',
      reason: 'Looks like personal content (video, document, or project file). Make sure you no longer need it.',
    };
  }

  return {
    level: 'caution',
    label: 'Review',
    reason: "A large file. Reclaim can't tell what's in it, so check before deleting.",
  };
}

export function classifyAppLeftover(path: string): SafetyInfo {
  const lowerPath = path.toLowerCase();

  if (lowerPath.includes('/application support/')) {
    return {
      level: 'risky',
      label: 'Review first',
      reason: 'May contain saved data (projects, licenses, game saves) for an app you could reinstall later.',
    };
  }

  if (lowerPath.includes('/preferences/') || lowerPath.includes('/caches/') || lowerPath.includes('/saved application state/')) {
    return {
      level: 'safe',
      label: 'Safe',
      reason: "Just settings or cache for an app that's not currently installed.",
    };
  }

  return {
    level: 'caution',
    label: 'Review',
    reason: "Leftover data for an app that's not currently installed. Reinstalling it later won't bring this back.",
  };
}

export function getSafetyInfo(
  category: 'Duplicates' | 'AI Cache' | 'Dev Cleanup' | 'Large Files' | 'App Leftovers',
  item: { path: string; name: string; devCategory?: string }
): SafetyInfo {
  switch (category) {
    case 'Duplicates': return SAFE_DUPLICATE;
    case 'AI Cache': return SAFE_AI_CACHE;
    case 'Dev Cleanup': return safeDevCleanup(item.devCategory || 'build output');
    case 'Large Files': return classifyLargeFile(item.path, item.name);
    case 'App Leftovers': return classifyAppLeftover(item.path);
  }
}

export const SAFETY_STYLES: Record<SafetyLevel, { badge: string; dot: string }> = {
  safe: { badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-400' },
  caution: { badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20', dot: 'bg-amber-400' },
  risky: { badge: 'bg-red-500/10 text-red-400 border-red-500/20', dot: 'bg-red-400' },
};
