// 자동 생성 파일 — 직접 고치지 말 것.
// tools/sprites/rig/make_run_clip.py 를 고치고 다시 실행한다.
export const RIG = {
  "unit": 1,
  "bones": [
    {
      "name": "torso",
      "parent": null,
      "length": 0.36,
      "rest": 0,
      "attach": [
        0,
        0
      ]
    },
    {
      "name": "head",
      "parent": "torso",
      "length": 0.16,
      "rest": 0,
      "attach": [
        0.36,
        0
      ]
    },
    {
      "name": "armF_up",
      "parent": "torso",
      "length": 0.17,
      "rest": 0,
      "attach": [
        0.3384,
        0
      ]
    },
    {
      "name": "armF_lo",
      "parent": "armF_up",
      "length": 0.16,
      "rest": 0,
      "attach": [
        0.17,
        0
      ]
    },
    {
      "name": "legF_thigh",
      "parent": null,
      "length": 0.28,
      "rest": 0,
      "attach": [
        0,
        0
      ]
    },
    {
      "name": "legF_shin",
      "parent": "legF_thigh",
      "length": 0.28,
      "rest": 0,
      "attach": [
        0.28,
        0
      ]
    },
    {
      "name": "legN_thigh",
      "parent": null,
      "length": 0.28,
      "rest": 0,
      "attach": [
        0,
        0
      ]
    },
    {
      "name": "legN_shin",
      "parent": "legN_thigh",
      "length": 0.28,
      "rest": 0,
      "attach": [
        0.28,
        0
      ]
    },
    {
      "name": "armN_up",
      "parent": "torso",
      "length": 0.17,
      "rest": 0,
      "attach": [
        0.3384,
        0
      ]
    },
    {
      "name": "armN_lo",
      "parent": "armN_up",
      "length": 0.16,
      "rest": 0,
      "attach": [
        0.17,
        0
      ]
    }
  ],
  "drawOrder": [
    "armF_up",
    "armF_lo",
    "legF_thigh",
    "legF_shin",
    "torso",
    "head",
    "legN_thigh",
    "legN_shin",
    "armN_up",
    "armN_lo"
  ],
  "clips": {
    "run": {
      "fps": 20,
      "loop": true,
      "frames": [
        {
          "root": [
            0.0,
            -0.48
          ],
          "angles": {
            "torso": -80.08,
            "head": -70.11,
            "armF_up": 120.0,
            "armF_lo": 85.0,
            "armN_up": 60.0,
            "armN_lo": -45.0,
            "legF_thigh": 46.08,
            "legF_shin": 83.69,
            "legN_thigh": 96.31,
            "legN_shin": 133.92
          },
          "phase": "contact",
          "_dbg": {
            "plantY": 0.0,
            "farX": 0.225,
            "nearX": -0.225
          }
        },
        {
          "root": [
            0.0,
            -0.469
          ],
          "angles": {
            "torso": -80.08,
            "head": -70.11,
            "armF_up": 115.98,
            "armF_lo": 76.29,
            "armN_up": 64.02,
            "armN_lo": -36.29,
            "legF_thigh": 43.82,
            "legF_shin": 100.71,
            "legN_thigh": 77.16,
            "legN_shin": 156.65
          },
          "phase": "contact",
          "_dbg": {
            "plantY": 0.0,
            "farX": 0.15,
            "nearX": -0.195
          }
        },
        {
          "root": [
            0.0,
            -0.447
          ],
          "angles": {
            "torso": -80.08,
            "head": -70.11,
            "armF_up": 105.0,
            "armF_lo": 52.5,
            "armN_up": 75.0,
            "armN_lo": -12.5,
            "legF_thigh": 44.51,
            "legF_shin": 116.44,
            "legN_thigh": 55.44,
            "legN_shin": 165.7
          },
          "phase": "midstance",
          "_dbg": {
            "plantY": 0.0,
            "farX": 0.075,
            "nearX": -0.113
          }
        },
        {
          "root": [
            0.0,
            -0.436
          ],
          "angles": {
            "torso": -80.08,
            "head": -70.11,
            "armF_up": 90.0,
            "armF_lo": 20.0,
            "armN_up": 90.0,
            "armN_lo": 20.0,
            "legF_thigh": 51.13,
            "legF_shin": 128.87,
            "legN_thigh": 28.36,
            "legN_shin": 151.64
          },
          "phase": "midstance",
          "_dbg": {
            "plantY": 0.0,
            "farX": 0.0,
            "nearX": -0.0
          }
        },
        {
          "root": [
            0.0,
            -0.447
          ],
          "angles": {
            "torso": -80.08,
            "head": -70.11,
            "armF_up": 75.0,
            "armF_lo": -12.5,
            "armN_up": 105.0,
            "armN_lo": 52.5,
            "legF_thigh": 63.56,
            "legF_shin": 135.49,
            "legN_thigh": 14.3,
            "legN_shin": 124.56
          },
          "phase": "midstance",
          "_dbg": {
            "plantY": 0.0,
            "farX": -0.075,
            "nearX": 0.112
          }
        },
        {
          "root": [
            0.0,
            -0.469
          ],
          "angles": {
            "torso": -80.08,
            "head": -70.11,
            "armF_up": 64.02,
            "armF_lo": -36.29,
            "armN_up": 115.98,
            "armN_lo": 76.29,
            "legF_thigh": 79.29,
            "legF_shin": 136.18,
            "legN_thigh": 23.35,
            "legN_shin": 102.84
          },
          "phase": "push",
          "_dbg": {
            "plantY": 0.0,
            "farX": -0.15,
            "nearX": 0.195
          }
        },
        {
          "root": [
            0.0,
            -0.48
          ],
          "angles": {
            "torso": -80.08,
            "head": -70.11,
            "armF_up": 60.0,
            "armF_lo": -45.0,
            "armN_up": 120.0,
            "armN_lo": 85.0,
            "legF_thigh": 96.31,
            "legF_shin": 133.92,
            "legN_thigh": 46.08,
            "legN_shin": 83.69
          },
          "phase": "swing",
          "_dbg": {
            "plantY": -0.0,
            "farX": -0.225,
            "nearX": 0.225
          }
        },
        {
          "root": [
            0.0,
            -0.469
          ],
          "angles": {
            "torso": -80.08,
            "head": -70.11,
            "armF_up": 64.02,
            "armF_lo": -36.29,
            "armN_up": 115.98,
            "armN_lo": 76.29,
            "legF_thigh": 77.16,
            "legF_shin": 156.65,
            "legN_thigh": 43.82,
            "legN_shin": 100.71
          },
          "phase": "swing",
          "_dbg": {
            "plantY": 0.0,
            "farX": -0.195,
            "nearX": 0.15
          }
        },
        {
          "root": [
            0.0,
            -0.447
          ],
          "angles": {
            "torso": -80.08,
            "head": -70.11,
            "armF_up": 75.0,
            "armF_lo": -12.5,
            "armN_up": 105.0,
            "armN_lo": 52.5,
            "legF_thigh": 55.44,
            "legF_shin": 165.7,
            "legN_thigh": 44.51,
            "legN_shin": 116.44
          },
          "phase": "swing",
          "_dbg": {
            "plantY": 0.0,
            "farX": -0.113,
            "nearX": 0.075
          }
        },
        {
          "root": [
            0.0,
            -0.436
          ],
          "angles": {
            "torso": -80.08,
            "head": -70.11,
            "armF_up": 90.0,
            "armF_lo": 20.0,
            "armN_up": 90.0,
            "armN_lo": 20.0,
            "legF_thigh": 28.36,
            "legF_shin": 151.64,
            "legN_thigh": 51.13,
            "legN_shin": 128.87
          },
          "phase": "swing",
          "_dbg": {
            "plantY": 0.0,
            "farX": -0.0,
            "nearX": 0.0
          }
        },
        {
          "root": [
            0.0,
            -0.447
          ],
          "angles": {
            "torso": -80.08,
            "head": -70.11,
            "armF_up": 105.0,
            "armF_lo": 52.5,
            "armN_up": 75.0,
            "armN_lo": -12.5,
            "legF_thigh": 14.3,
            "legF_shin": 124.56,
            "legN_thigh": 63.56,
            "legN_shin": 135.49
          },
          "phase": "swing",
          "_dbg": {
            "plantY": 0.0,
            "farX": 0.113,
            "nearX": -0.075
          }
        },
        {
          "root": [
            0.0,
            -0.469
          ],
          "angles": {
            "torso": -80.08,
            "head": -70.11,
            "armF_up": 115.98,
            "armF_lo": 76.29,
            "armN_up": 64.02,
            "armN_lo": -36.29,
            "legF_thigh": 23.35,
            "legF_shin": 102.84,
            "legN_thigh": 79.29,
            "legN_shin": 136.18
          },
          "phase": "swing",
          "_dbg": {
            "plantY": 0.0,
            "farX": 0.195,
            "nearX": -0.15
          }
        }
      ]
    }
  }
}
