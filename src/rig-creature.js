// 자동 생성 파일 — 직접 고치지 말 것.
// tools/sprites/rig/make_creature_rig.py 를 고치고 다시 실행한다.
export const CREATURE = {
  "unit": 1090,
  "bones": [
    {
      "name": "body",
      "parent": null,
      "rest": -65.66,
      "attach": [
        0,
        0
      ]
    },
    {
      "name": "head",
      "parent": "body",
      "rest": -97.13,
      "attach": [
        230.49,
        0.0
      ]
    },
    {
      "name": "armR_up",
      "parent": "body",
      "rest": 65.48,
      "attach": [
        246.11,
        58.79
      ]
    },
    {
      "name": "armR_lo",
      "parent": "armR_up",
      "rest": -51.76,
      "attach": [
        175.87,
        -0.01
      ]
    },
    {
      "name": "armL_up",
      "parent": "body",
      "rest": 124.16,
      "attach": [
        200.66,
        -211.5
      ]
    },
    {
      "name": "armL_lo",
      "parent": "armL_up",
      "rest": 116.57,
      "attach": [
        169.19,
        -0.0
      ]
    },
    {
      "name": "tail",
      "parent": "body",
      "rest": 158.51,
      "attach": [
        -260.84,
        -59.81
      ]
    }
  ],
  "drawOrder": [
    "tail",
    "armR_up",
    "armR_lo",
    "body",
    "head",
    "armL_up",
    "armL_lo"
  ],
  "parts": [
    {
      "name": "head",
      "pivot": [
        0.5741,
        0.8724
      ],
      "file": "head.png"
    },
    {
      "name": "armR_lo",
      "pivot": [
        0.1272,
        0.9183
      ],
      "file": "armR_lo.png"
    },
    {
      "name": "armR_up",
      "pivot": [
        0.3252,
        0.186
      ],
      "file": "armR_up.png"
    },
    {
      "name": "armL_lo",
      "pivot": [
        0.8203,
        0.0829
      ],
      "file": "armL_lo.png"
    },
    {
      "name": "armL_up",
      "pivot": [
        0.6854,
        0.1802
      ],
      "file": "armL_up.png"
    },
    {
      "name": "tail",
      "pivot": [
        0.9874,
        0.2102
      ],
      "file": "tail.png"
    },
    {
      "name": "body",
      "pivot": [
        0.5437,
        0.5539
      ],
      "file": "body.png"
    }
  ],
  "clips": {
    "idle": {
      "fps": 12,
      "loop": true,
      "frames": [
        {
          "root": [
            -10,
            -485.0
          ],
          "angles": {
            "body": -65.66,
            "head": -95.88,
            "armR_up": 66.83,
            "armR_lo": -48.84,
            "armL_up": 125.61,
            "armL_lo": 119.82,
            "tail": 161.17
          }
        },
        {
          "root": [
            -10,
            -486.29
          ],
          "angles": {
            "body": -65.45,
            "head": -95.39,
            "armR_up": 67.09,
            "armR_lo": -48.6,
            "armL_up": 126.06,
            "armL_lo": 120.31,
            "tail": 165.11
          }
        },
        {
          "root": [
            -10,
            -487.5
          ],
          "angles": {
            "body": -65.26,
            "head": -95.02,
            "armR_up": 67.25,
            "armR_lo": -48.58,
            "armL_up": 126.37,
            "armL_lo": 120.55,
            "tail": 167.29
          }
        },
        {
          "root": [
            -10,
            -488.54
          ],
          "angles": {
            "body": -65.09,
            "head": -94.8,
            "armR_up": 67.28,
            "armR_lo": -48.77,
            "armL_up": 126.54,
            "armL_lo": 120.52,
            "tail": 167.11
          }
        },
        {
          "root": [
            -10,
            -489.33
          ],
          "angles": {
            "body": -64.97,
            "head": -94.73,
            "armR_up": 67.18,
            "armR_lo": -49.17,
            "armL_up": 126.54,
            "armL_lo": 120.21,
            "tail": 164.63
          }
        },
        {
          "root": [
            -10,
            -489.83
          ],
          "angles": {
            "body": -64.89,
            "head": -94.83,
            "armR_up": 66.98,
            "armR_lo": -49.74,
            "armL_up": 126.38,
            "armL_lo": 119.66,
            "tail": 160.51
          }
        },
        {
          "root": [
            -10,
            -490.0
          ],
          "angles": {
            "body": -64.86,
            "head": -95.08,
            "armR_up": 66.67,
            "armR_lo": -50.45,
            "armL_up": 126.07,
            "armL_lo": 118.9,
            "tail": 155.85
          }
        },
        {
          "root": [
            -10,
            -489.83
          ],
          "angles": {
            "body": -64.89,
            "head": -95.48,
            "armR_up": 66.28,
            "armR_lo": -51.25,
            "armL_up": 125.63,
            "armL_lo": 117.98,
            "tail": 151.91
          }
        },
        {
          "root": [
            -10,
            -489.33
          ],
          "angles": {
            "body": -64.97,
            "head": -95.99,
            "armR_up": 65.83,
            "armR_lo": -52.09,
            "armL_up": 125.09,
            "armL_lo": 116.96,
            "tail": 149.73
          }
        },
        {
          "root": [
            -10,
            -488.54
          ],
          "angles": {
            "body": -65.09,
            "head": -96.57,
            "armR_up": 65.36,
            "armR_lo": -52.9,
            "armL_up": 124.48,
            "armL_lo": 115.91,
            "tail": 149.91
          }
        },
        {
          "root": [
            -10,
            -487.5
          ],
          "angles": {
            "body": -65.26,
            "head": -97.19,
            "armR_up": 64.9,
            "armR_lo": -53.64,
            "armL_up": 123.86,
            "armL_lo": 114.92,
            "tail": 152.39
          }
        },
        {
          "root": [
            -10,
            -486.29
          ],
          "angles": {
            "body": -65.45,
            "head": -97.81,
            "armR_up": 64.48,
            "armR_lo": -54.24,
            "armL_up": 123.25,
            "armL_lo": 114.03,
            "tail": 156.51
          }
        },
        {
          "root": [
            -10,
            -485.0
          ],
          "angles": {
            "body": -65.66,
            "head": -98.38,
            "armR_up": 64.13,
            "armR_lo": -54.68,
            "armL_up": 122.71,
            "armL_lo": 113.32,
            "tail": 161.17
          }
        },
        {
          "root": [
            -10,
            -483.71
          ],
          "angles": {
            "body": -65.87,
            "head": -98.87,
            "armR_up": 63.87,
            "armR_lo": -54.92,
            "armL_up": 122.26,
            "armL_lo": 112.83,
            "tail": 165.11
          }
        },
        {
          "root": [
            -10,
            -482.5
          ],
          "angles": {
            "body": -66.06,
            "head": -99.24,
            "armR_up": 63.71,
            "armR_lo": -54.94,
            "armL_up": 121.95,
            "armL_lo": 112.59,
            "tail": 167.29
          }
        },
        {
          "root": [
            -10,
            -481.46
          ],
          "angles": {
            "body": -66.23,
            "head": -99.46,
            "armR_up": 63.68,
            "armR_lo": -54.75,
            "armL_up": 121.78,
            "armL_lo": 112.62,
            "tail": 167.11
          }
        },
        {
          "root": [
            -10,
            -480.67
          ],
          "angles": {
            "body": -66.35,
            "head": -99.53,
            "armR_up": 63.78,
            "armR_lo": -54.35,
            "armL_up": 121.78,
            "armL_lo": 112.93,
            "tail": 164.63
          }
        },
        {
          "root": [
            -10,
            -480.17
          ],
          "angles": {
            "body": -66.43,
            "head": -99.43,
            "armR_up": 63.98,
            "armR_lo": -53.78,
            "armL_up": 121.94,
            "armL_lo": 113.48,
            "tail": 160.51
          }
        },
        {
          "root": [
            -10,
            -480.0
          ],
          "angles": {
            "body": -66.46,
            "head": -99.18,
            "armR_up": 64.29,
            "armR_lo": -53.07,
            "armL_up": 122.25,
            "armL_lo": 114.24,
            "tail": 155.85
          }
        },
        {
          "root": [
            -10,
            -480.17
          ],
          "angles": {
            "body": -66.43,
            "head": -98.78,
            "armR_up": 64.68,
            "armR_lo": -52.27,
            "armL_up": 122.69,
            "armL_lo": 115.16,
            "tail": 151.91
          }
        },
        {
          "root": [
            -10,
            -480.67
          ],
          "angles": {
            "body": -66.35,
            "head": -98.27,
            "armR_up": 65.13,
            "armR_lo": -51.43,
            "armL_up": 123.23,
            "armL_lo": 116.18,
            "tail": 149.73
          }
        },
        {
          "root": [
            -10,
            -481.46
          ],
          "angles": {
            "body": -66.23,
            "head": -97.69,
            "armR_up": 65.6,
            "armR_lo": -50.62,
            "armL_up": 123.84,
            "armL_lo": 117.23,
            "tail": 149.91
          }
        },
        {
          "root": [
            -10,
            -482.5
          ],
          "angles": {
            "body": -66.06,
            "head": -97.07,
            "armR_up": 66.06,
            "armR_lo": -49.88,
            "armL_up": 124.46,
            "armL_lo": 118.22,
            "tail": 152.39
          }
        },
        {
          "root": [
            -10,
            -483.71
          ],
          "angles": {
            "body": -65.87,
            "head": -96.45,
            "armR_up": 66.48,
            "armR_lo": -49.28,
            "armL_up": 125.07,
            "armL_lo": 119.11,
            "tail": 156.51
          }
        }
      ]
    },
    "cast": {
      "fps": 20,
      "loop": false,
      "frames": [
        {
          "root": [
            -10,
            -485.0
          ],
          "angles": {
            "body": -65.66,
            "head": -97.13,
            "armR_up": 65.48,
            "armR_lo": -51.76,
            "armL_up": 124.16,
            "armL_lo": 116.57,
            "tail": 158.51
          }
        },
        {
          "root": [
            -10,
            -488.64
          ],
          "angles": {
            "body": -64.52,
            "head": -100.31,
            "armR_up": 53.66,
            "armR_lo": -60.85,
            "armL_up": 127.8,
            "armL_lo": 121.12,
            "tail": 152.15
          }
        },
        {
          "root": [
            -10,
            -490.55
          ],
          "angles": {
            "body": -63.93,
            "head": -101.99,
            "armR_up": 47.44,
            "armR_lo": -65.63,
            "armL_up": 129.71,
            "armL_lo": 123.51,
            "tail": 148.8
          }
        },
        {
          "root": [
            -10,
            -491.81
          ],
          "angles": {
            "body": -63.53,
            "head": -103.09,
            "armR_up": 43.35,
            "armR_lo": -68.78,
            "armL_up": 130.97,
            "armL_lo": 125.08,
            "tail": 146.59
          }
        },
        {
          "root": [
            -10,
            -492.58
          ],
          "angles": {
            "body": -63.29,
            "head": -103.76,
            "armR_up": 40.84,
            "armR_lo": -70.71,
            "armL_up": 131.74,
            "armL_lo": 126.05,
            "tail": 145.24
          }
        },
        {
          "root": [
            -10,
            -492.95
          ],
          "angles": {
            "body": -63.18,
            "head": -104.08,
            "armR_up": 39.65,
            "armR_lo": -71.63,
            "armL_up": 132.11,
            "armL_lo": 126.5,
            "tail": 144.6
          }
        },
        {
          "root": [
            -10,
            -492.97
          ],
          "angles": {
            "body": -63.17,
            "head": -104.11,
            "armR_up": 39.57,
            "armR_lo": -71.69,
            "armL_up": 132.13,
            "armL_lo": 126.54,
            "tail": 144.56
          }
        },
        {
          "root": [
            -10,
            -492.71
          ],
          "angles": {
            "body": -63.25,
            "head": -103.87,
            "armR_up": 40.44,
            "armR_lo": -71.03,
            "armL_up": 131.87,
            "armL_lo": 126.2,
            "tail": 145.02
          }
        },
        {
          "root": [
            -10,
            -492.2
          ],
          "angles": {
            "body": -63.41,
            "head": -103.43,
            "armR_up": 42.1,
            "armR_lo": -69.75,
            "armL_up": 131.36,
            "armL_lo": 125.56,
            "tail": 145.92
          }
        },
        {
          "root": [
            -10,
            -491.48
          ],
          "angles": {
            "body": -63.63,
            "head": -102.8,
            "armR_up": 44.42,
            "armR_lo": -67.96,
            "armL_up": 130.64,
            "armL_lo": 124.67,
            "tail": 147.17
          }
        },
        {
          "root": [
            -10,
            -490.61
          ],
          "angles": {
            "body": -63.91,
            "head": -102.03,
            "armR_up": 47.26,
            "armR_lo": -65.77,
            "armL_up": 129.77,
            "armL_lo": 123.58,
            "tail": 148.7
          }
        },
        {
          "root": [
            -10,
            -489.6
          ],
          "angles": {
            "body": -64.22,
            "head": -101.16,
            "armR_up": 50.52,
            "armR_lo": -63.27,
            "armL_up": 128.76,
            "armL_lo": 122.32,
            "tail": 150.45
          }
        },
        {
          "root": [
            -10,
            -488.51
          ],
          "angles": {
            "body": -64.56,
            "head": -100.2,
            "armR_up": 54.07,
            "armR_lo": -60.54,
            "armL_up": 127.67,
            "armL_lo": 120.96,
            "tail": 152.37
          }
        },
        {
          "root": [
            -10,
            -487.36
          ],
          "angles": {
            "body": -64.92,
            "head": -99.19,
            "armR_up": 57.81,
            "armR_lo": -57.66,
            "armL_up": 126.52,
            "armL_lo": 119.52,
            "tail": 154.38
          }
        },
        {
          "root": [
            -10,
            -486.18
          ],
          "angles": {
            "body": -65.29,
            "head": -98.16,
            "armR_up": 61.64,
            "armR_lo": -54.71,
            "armL_up": 125.34,
            "armL_lo": 118.05,
            "tail": 156.44
          }
        },
        {
          "root": [
            -10,
            -485.0
          ],
          "angles": {
            "body": -65.66,
            "head": -97.13,
            "armR_up": 65.48,
            "armR_lo": -51.76,
            "armL_up": 124.16,
            "armL_lo": 116.57,
            "tail": 158.51
          }
        }
      ]
    }
  }
}
