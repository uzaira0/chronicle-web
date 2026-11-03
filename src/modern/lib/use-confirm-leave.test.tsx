import { afterEach, describe, expect, test } from 'bun:test';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { createMemoryRouter, Link, Outlet, RouterProvider } from 'react-router';
import { SAVED_EDITS_NAVIGATION, UnsavedEditsGuard, useConfirmLeave } from './use-confirm-leave';

function Editor() {
  const [unsaved, setUnsaved] = useState(false);
  useConfirmLeave(unsaved);
  return (
    <>
      <button onClick={() => setUnsaved(true)} type="button">
        Edit
      </button>
      <button onClick={() => setUnsaved(false)} type="button">
        Save
      </button>
      <Link to="/other">Other page</Link>
      <Link state={SAVED_EDITS_NAVIGATION} to="/other">
        Saved page
      </Link>
    </>
  );
}

function renderApp() {
  const router = createMemoryRouter([
    {
      children: [
        { element: <Editor />, path: '/' },
        {
          element: (
            <>
              <p>Other page content</p>
              <Editor />
            </>
          ),
          path: '/other',
        },
      ],
      element: (
        <>
          <UnsavedEditsGuard />
          <Outlet />
        </>
      ),
    },
  ]);
  render(<RouterProvider router={router} />);
  return router;
}

const originalConfirmDescriptor = Object.getOwnPropertyDescriptor(window, 'confirm');
afterEach(() => {
  if (originalConfirmDescriptor) Object.defineProperty(window, 'confirm', originalConfirmDescriptor);
  else Reflect.deleteProperty(window, 'confirm');
});

function answerConfirm(answer: boolean) {
  const prompts: string[] = [];
  window.confirm = (message?: string) => {
    prompts.push(String(message));
    return answer;
  };
  return prompts;
}

describe('UnsavedEditsGuard', () => {
  test('keeps the researcher on the page when they decline to discard unsaved edits', async () => {
    const prompts = answerConfirm(false);
    const router = renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('link', { name: 'Other page' }));

    await waitFor(() => expect(prompts).toHaveLength(1));
    expect(router.state.location.pathname).toBe('/');
    expect(screen.queryByText('Other page content')).toBeNull();
  });

  test('leaves once the researcher confirms', async () => {
    answerConfirm(true);
    const router = renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('link', { name: 'Other page' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/other'));
  });

  test('navigates without asking after the edits are saved', async () => {
    const prompts = answerConfirm(false);
    const router = renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(screen.getByRole('link', { name: 'Other page' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/other'));
    expect(prompts).toHaveLength(0);
  });

  test('the move a pending save makes to its result passes while the edits stay protected', async () => {
    const prompts = answerConfirm(false);
    const router = renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('link', { name: 'Saved page' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/other'));
    expect(prompts).toHaveLength(0);
  });

  test('a saved history entry never exempts a later Back with unsaved edits', async () => {
    const prompts = answerConfirm(false);
    const router = renderApp();
    await router.navigate('/other', { state: SAVED_EDITS_NAVIGATION });
    await router.navigate('/');
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await router.navigate(-1);
    await waitFor(() => expect(prompts).toHaveLength(1));
    expect(router.state.location.pathname).toBe('/');
  });
});
