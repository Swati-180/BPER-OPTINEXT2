export const sidebarVariants = {
  open: { width: 280 },
  closed: { width: 84 },
};

export const sidebarTransition = {
  type: 'spring',
  stiffness: 205,
  damping: 34,
  mass: 1.08,
};

export const labelTransition = {
  opacity: { duration: 0.16, ease: 'easeInOut' as const },
  x: { duration: 0.2, ease: 'easeInOut' as const },
  maxWidth: { duration: 0.3, ease: 'easeInOut' as const },
  marginLeft: { duration: 0.22, ease: 'easeInOut' as const },
};
