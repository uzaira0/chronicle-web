import { describe, expect, test } from 'bun:test';
import { render, screen } from '@testing-library/react';

import { PublicResearchPolicyPage } from './public-research-policy-page';

describe('PublicResearchPolicyPage', () => {
  test('renders the privacy heading and both policy sections for /privacy', () => {
    render(<PublicResearchPolicyPage initialSection="privacy" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Chronicle Privacy Policy' })).toBeTruthy();
    expect(screen.getByText('Data handling')).toBeTruthy();
    expect(screen.getByText('Human-subjects research and consent')).toBeTruthy();
    expect(screen.getByText('Withdrawal and deletion requests')).toBeTruthy();
  });

  test('renders the withdrawal heading for /withdrawal', () => {
    render(<PublicResearchPolicyPage initialSection="withdrawal" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Withdrawal and data deletion' })).toBeTruthy();
  });

  test('links the support contact without exposing any credential guidance', () => {
    render(<PublicResearchPolicyPage initialSection="privacy" />);

    const mailto = screen.getByRole('link', { name: /uzairalam998@gmail\.com/ });
    expect(mailto.getAttribute('href')).toBe('mailto:uzairalam998@gmail.com');
    expect(screen.getByRole('link', { name: 'bcm.edu/privacy' }).getAttribute('href')).toBe(
      'https://www.bcm.edu/privacy',
    );
  });

  test('states the one-active-study app limit and the server multi-study boundary', () => {
    render(<PublicResearchPolicyPage initialSection="privacy" />);

    expect(screen.getByText(/one active study at a time on each app installation/i)).toBeTruthy();
    expect(screen.getByText(/each independently operated server can support many separate studies/i)).toBeTruthy();
  });

  test('distinguishes the Play publisher notice from each researcher and server operator policy', () => {
    render(<PublicResearchPolicyPage initialSection="privacy" />);

    expect(screen.getByText(/does not make Baylor College of Medicine the sponsor or server operator/i)).toBeTruthy();
    expect(screen.getByText(/does not replace the consent form or study-specific privacy notice/i)).toBeTruthy();
  });

  test('describes only the minimal Play data boundary', () => {
    render(<PublicResearchPolicyPage initialSection="privacy" />);

    expect(screen.getByText(/app package names and labels/i)).toBeTruthy();
    expect(screen.getByText(/research-data upload fails.+bounded exception class/i)).toBeTruthy();
    expect(screen.getByText(/sent under the active participant and device enrollment/i)).toBeTruthy();
    expect(screen.getByText(/does not collect Health Connect or other health records/i)).toBeTruthy();
    expect(screen.getByText(/Server URLs, free-form error text, invitation secrets/i)).toBeTruthy();
    expect(screen.queryByText(/previously distributed version/i)).toBeNull();
    expect(screen.queryByText(/per-app network byte counts/i)).toBeNull();
    expect(screen.queryByText(/target participant, another person, or unassigned/i)).toBeNull();
  });
});
