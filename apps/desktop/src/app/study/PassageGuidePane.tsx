// FR-303 — Automated Passage Guide (literary genre, top-voted cross-references, people & places)
// and the Factbook dossier (aliases, era, coordinates, Scripture occurrences).
import { useEffect } from 'react';

import type { FactbookEntity } from '@breath-and-word/core';

import { useCoreRuntime } from '../CoreRuntime';
import { useCoreStore } from '../useCoreStore';

import { CARD, LINK, PANEL_HEADING } from './styles';

export interface PassageGuidePaneProps {
  readonly startVerseId: number;
  readonly endVerseId: number;
  readonly translationPackId: string;
  readonly onOpenVerse: (canonicalVerseId: number) => void;
}

/** Bible-lands frame (Egypt → Mesopotamia, Rome-ward to Asia Minor) for the locator. */
const MAP = { west: 12, east: 50, south: 22, north: 44, width: 240, height: 140 };

/** Tiny offline locator: a graticule with the place marked. No tiles, no network (A2 offline-first). */
function Locator({ latitude, longitude, name }: { latitude: number; longitude: number; name: string }) {
  const x = ((Math.min(Math.max(longitude, MAP.west), MAP.east) - MAP.west) / (MAP.east - MAP.west)) * MAP.width;
  const y = ((MAP.north - Math.min(Math.max(latitude, MAP.south), MAP.north)) / (MAP.north - MAP.south)) * MAP.height;
  const meridians = [15, 20, 25, 30, 35, 40, 45];
  const parallels = [25, 30, 35, 40];
  return (
    <svg
      viewBox={`0 0 ${MAP.width} ${MAP.height}`}
      className="w-full rounded-md border border-hairline bg-elevated text-ink-secondary"
      role="img"
      aria-label={`${name} at ${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`}
    >
      {meridians.map((lon) => {
        const gx = ((lon - MAP.west) / (MAP.east - MAP.west)) * MAP.width;
        return <line key={`m${lon}`} x1={gx} x2={gx} y1={0} y2={MAP.height} stroke="currentColor" strokeOpacity={0.2} />;
      })}
      {parallels.map((lat) => {
        const gy = ((MAP.north - lat) / (MAP.north - MAP.south)) * MAP.height;
        return <line key={`p${lat}`} y1={gy} y2={gy} x1={0} x2={MAP.width} stroke="currentColor" strokeOpacity={0.2} />;
      })}
      <circle cx={x} cy={y} r={5} className="fill-accent" />
      <circle cx={x} cy={y} r={10} className="fill-none stroke-accent" strokeOpacity={0.5} />
    </svg>
  );
}

function EntityChip({ entity, onOpen }: { entity: FactbookEntity; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(entity.entityId)}
      className="rounded-pill border border-hairline bg-surface px-md py-xxs font-ui text-uiSm text-ink-primary transition hover:border-accent"
    >
      {entity.name}
      <span className="ml-xs font-ui text-uiXs text-ink-secondary">{entity.entityType}</span>
    </button>
  );
}

export function PassageGuidePane({ startVerseId, endVerseId, translationPackId, onOpenVerse }: PassageGuidePaneProps) {
  const { stores } = useCoreRuntime();
  const { passageGuide, activeDossier, error } = useCoreStore(stores.study);

  useEffect(() => {
    void stores.study.getState().loadPassageGuide(startVerseId, endVerseId, translationPackId);
  }, [stores, startVerseId, endVerseId, translationPackId]);

  const openEntity = (entityId: string) => void stores.study.getState().openFactbookEntity(entityId);
  const guide =
    passageGuide !== null && passageGuide.startVerseId === startVerseId && passageGuide.endVerseId === endVerseId
      ? passageGuide
      : null;

  return (
    <div className="flex flex-col gap-md">
      {error !== null && (
        <p className="font-ui text-uiSm text-ink-red" role="alert">
          {error.userMessage}
        </p>
      )}
      {guide !== null && (
        <>
          <div className="flex items-center justify-between gap-sm">
            <h3 className={PANEL_HEADING}>{`Passage Guide · ${guide.passageReference}`}</h3>
            {guide.literaryGenre !== undefined && (
              <span className="rounded-pill bg-elevated px-sm py-xxs font-ui text-uiXs text-ink-secondary">
                {guide.literaryGenre.replace(/_/g, ' ').toLowerCase()}
              </span>
            )}
          </div>

          <section className={CARD}>
            <h4 className={PANEL_HEADING}>Cross-references</h4>
            {guide.crossReferences.length === 0 ? (
              <p className="mt-xs font-ui text-uiSm text-ink-secondary">No cross-references for this passage.</p>
            ) : (
              <ol className="mt-xs flex flex-col gap-xxs">
                {guide.crossReferences.map((ref) => (
                  <li key={ref.id} className="flex items-center justify-between gap-sm">
                    <button type="button" className={LINK} onClick={() => onOpenVerse(ref.toStartVerseId)}>
                      {ref.passageReference}
                    </button>
                    <span className="font-ui text-uiXs text-ink-secondary" title="Community votes (OpenBible.info)">
                      {`${ref.votes} votes`}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {guide.entities.length > 0 && (
            <section className="flex flex-col gap-xs">
              <h4 className={PANEL_HEADING}>People &amp; places</h4>
              <div className="flex flex-wrap gap-xs">
                {guide.entities.map((entity) => (
                  <EntityChip key={entity.entityId} entity={entity} onOpen={openEntity} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {activeDossier !== null && (
        <section className={CARD} aria-label={`Factbook: ${activeDossier.entity.name}`}>
          <div className="flex items-baseline justify-between gap-sm">
            <h3 className="font-ui text-uiLg text-ink-primary">{activeDossier.entity.name}</h3>
            <span className="font-ui text-uiXs capitalize text-ink-secondary">{activeDossier.entity.entityType}</span>
          </div>
          {activeDossier.entity.aliases.length > 0 && (
            <p className="font-ui text-uiXs text-ink-secondary">{`Also: ${activeDossier.entity.aliases.join(', ')}`}</p>
          )}
          {activeDossier.entity.eraLabel !== undefined && (
            <p className="font-ui text-uiXs text-ink-secondary">{activeDossier.entity.eraLabel}</p>
          )}
          <p className="mt-sm font-ui text-uiSm text-ink-primary">{activeDossier.entity.summary}</p>
          {activeDossier.entity.latitude !== undefined && activeDossier.entity.longitude !== undefined && (
            <div className="mt-sm flex flex-col gap-xxs">
              <Locator
                latitude={activeDossier.entity.latitude}
                longitude={activeDossier.entity.longitude}
                name={activeDossier.entity.name}
              />
              <p className="font-ui text-uiXs text-ink-secondary">
                {`${activeDossier.entity.latitude.toFixed(3)}°, ${activeDossier.entity.longitude.toFixed(3)}°`}
              </p>
            </div>
          )}
          <h4 className={`${PANEL_HEADING} mt-md`}>{`Occurrences · ${activeDossier.verseIds.length}`}</h4>
          <div className="mt-xs flex flex-wrap gap-x-sm gap-y-xxs">
            {activeDossier.verseIds.slice(0, 60).map((id, index) => (
              <button key={id} type="button" className={LINK} onClick={() => onOpenVerse(id)}>
                {activeDossier.references[index] ?? String(id)}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
