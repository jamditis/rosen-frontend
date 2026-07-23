// One owner for every modal that prevents background scrolling. Ref counting
// keeps nested dialogs locked regardless of which one closes first.
let activeLocks = 0;
let originalOverflow = '';

export const acquireBodyScrollLock = () => {
  if (typeof document === 'undefined' || !document.body) return () => {};

  const body = document.body;
  if (activeLocks === 0) originalOverflow = body.style.overflow;
  activeLocks += 1;
  body.style.overflow = 'hidden';

  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeLocks -= 1;

    if (activeLocks === 0) {
      body.style.overflow = originalOverflow;
      originalOverflow = '';
    }
  };
};
