import { lazy, Suspense } from 'react';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';

const GameStage = lazy(() => import('./game-stage.tsx').then(module => ({ default: module.GameStage })));

export function MatchStage(props: ComponentProps<typeof GameStage>) {
  const { t } = useTranslation();
  return <Suspense fallback={<div className="surface stage-loading" role="status">{t('loading')}</div>}>
    <GameStage {...props} />
  </Suspense>;
}
