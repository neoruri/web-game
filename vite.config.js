import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        tuner: 'tuner.html', // 밸런스 튜너 (개발용, /tuner.html)
        lab: 'lab.html', // 밸런스 랩 (분석용, /lab.html)
        skilltree: 'skilltree.html', // 스킬트리/능력치 UI 시안 (/skilltree.html)
        rig: 'rig.html', // 2D 뼈대 애니메이션 랩 (/rig.html)
        creature: 'creature.html', // 크리처 컷아웃 뼈대 랩 (/creature.html)
      },
    },
  },
})
