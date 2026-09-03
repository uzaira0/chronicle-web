import { describe, expect, test } from 'bun:test';
import { render, screen } from '@testing-library/react';

import { MissingStudyIdPanel } from './missing-study-id-panel';

describe('MissingStudyIdPanel', () => {
  test('renders title "Missing Study ID"', () => {
    render(<MissingStudyIdPanel section="Dashboard" />);
    expect(screen.getByText('Missing Study ID')).toBeTruthy();
  });

  test('renders description with section name', () => {
    render(<MissingStudyIdPanel section="Dashboard" />);
    expect(screen.getByText('Dashboard requires a study identifier.')).toBeTruthy();
  });

  test('renders eyebrow "Missing parameter"', () => {
    render(<MissingStudyIdPanel section="Sensors" />);
    expect(screen.getByText('Missing parameter')).toBeTruthy();
  });

  test('uses section prop in description text', () => {
    render(<MissingStudyIdPanel section="Questionnaires" />);
    expect(screen.getByText('Questionnaires requires a study identifier.')).toBeTruthy();
  });

  test('renders icon element', () => {
    const { container } = render(<MissingStudyIdPanel section="Test" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });
});
