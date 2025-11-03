import { memo } from 'react';

const Tag = memo(function Tag({ tone = 'neutral', children }) {
  return (
    <span className={`tag tag-${tone}`} role="status">
      {children}
    </span>
  );
});

export default Tag;
