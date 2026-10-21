import Particles from '../features/landing/Particles'
import styles from './PageBackdrop.module.css'

/** Общий фон внутренних страниц: те же частицы, что на главной, и приглушённые огни. Главная и вход рисуют свой фон. */
export function PageBackdrop() {
  return <div className={styles.backdrop} aria-hidden="true" data-no-print>
    <Particles className={styles.particles} particleColors={['#ffffff']} particleCount={1010} particleSpread={12} speed={0.1} particleBaseSize={20}
      glow={0.4} twinkle={0.2} moveParticlesOnHover={false} hoverEffect="repel" drift="up" driftSpeed={0.1} connections clickBurst={false}
      lightMode={false} pixelRatio={undefined} style={undefined} />
    <div className={styles.orbs}><i /><i /><i /></div>
  </div>
}
