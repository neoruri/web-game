import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        tuner: 'tuner.html', // 밸런스 튜너 (개발용, /tuner.html)
        lab: 'lab.html', // 밸런스 랩 (분석용, /lab.html)
      },
    },
  },
})
