import { expect, test } from 'bun:test';
import { render } from '@testing-library/react';

type Fiber = { return: Fiber | null; stateNode: unknown };

function failureMessage(received: unknown) {
  try {
    expect(received).toBeNull();
  } catch (error) {
    return String(error);
  }
  throw new Error('assertion unexpectedly passed');
}

// A failing assertion on anything that holds the React tree must print a bounded summary.
test('failing assertions on mounted nodes, fibers and fiber roots report without walking the tree', () => {
  const { container } = render(
    <ul>
      {Array.from({ length: 2000 }, (_, item) => `item-${item}`).map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>,
  );
  const item = container.querySelector('li') as Element;
  const fiberKey = Object.keys(item).find((key) => key.startsWith('__reactFiber')) as string;
  const fiber = (item as unknown as Record<string, Fiber>)[fiberKey] as Fiber;
  let hostRoot = fiber;
  while (hostRoot.return) hostRoot = hostRoot.return;
  for (const received of [item, { item }, fiber, hostRoot, hostRoot.stateNode]) {
    expect(failureMessage(received).length).toBeLessThan(2000);
  }
});
