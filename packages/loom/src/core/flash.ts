export type FlashType = 'success' | 'error' | 'warning' | 'info';

export interface LoomFlash {
  type: FlashType;
  title: string;
  message: string;
}

const FLASH_PRESETS: Record<string, LoomFlash> = {
  created: {
    type: 'success',
    title: 'Created',
    message: 'The record was saved successfully.',
  },
  updated: {
    type: 'success',
    title: 'Updated',
    message: 'Your changes have been saved.',
  },
  deleted: {
    type: 'success',
    title: 'Deleted',
    message: 'The record was removed.',
  },
  restored: {
    type: 'success',
    title: 'Restored',
    message: 'The record was restored.',
  },
};

export function flashFromQuery(
  success?: string,
  error?: string,
): LoomFlash | undefined {
  if (success) {
    return (
      FLASH_PRESETS[success] ?? {
        type: 'success',
        title: 'Success',
        message: success,
      }
    );
  }
  if (error) {
    return {
      type: 'error',
      title: 'Something went wrong',
      message: error,
    };
  }
  return undefined;
}
