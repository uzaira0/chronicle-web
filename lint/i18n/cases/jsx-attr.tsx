// Cases for web-i18n-jsx-attr. Marked lines must fire; unmarked lines must be clean.
import type { ReactNode } from 'react';

function Dialog(props: { title: string; children?: ReactNode }) {
  return <div title={props.title}>{props.children}</div>;
}

export function Cases({ t, label }: { t: (k: string) => string; label: string }) {
  return (
    <div>
      <button title="Delete study" type="button" />{/* FIRE: web-i18n-jsx-attr */}
      <button title='Delete' type="button" />{/* FIRE: web-i18n-jsx-attr */}
      <button aria-label="Close" type="button" />{/* FIRE: web-i18n-jsx-attr */}
      <img alt="Study logo" src="x.png" />{/* FIRE: web-i18n-jsx-attr */}
      <Dialog title="Edit study" />{/* FIRE: web-i18n-jsx-attr */}
      <input aria-description="Your participant id" />{/* FIRE: web-i18n-jsx-attr */}
      <section aria-roledescription="Study card" />{/* FIRE: web-i18n-jsx-attr */}
      <div aria-valuetext="Half done" />{/* FIRE: web-i18n-jsx-attr */}
      <div title="Multi-line tag" {/* FIRE: web-i18n-jsx-attr */}
        role="note"
      />
      <button title={'Close dialog'} type="button" />{/* FIRE: web-i18n-jsx-attr */}
      <button title={`Close ${label}`} type="button" />{/* FIRE: web-i18n-jsx-attr */}
      <button title={t('actions.delete')} type="button" />
      <div className={`flex ${label ? 'border-t border-border' : ''}`} />
      <label htmlFor={`participant-policy-${label}`} />
      <div id={`health-connect-${label}`} />
      <button title={`${label}`} type="button" />
      <button title={label} type="button" />
      <div className="flex items-center" />
      <div data-testid="submit button" />
      <nav id="main-nav" />
      <a href="/withdrawal">{t('x')}</a>
      <div aria-hidden="true" />
      <div aria-live="polite" />
      <img alt="" src="x.png" />
      <div title="" />
      <div role="button" />
      <input name="email" type="email" />
      <div title="42" />
    </div>
  );
}
