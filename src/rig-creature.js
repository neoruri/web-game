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
    },
    {
      "name": "legR_thigh",
      "parent": "body",
      "rest": 46.24,
      "attach": [
        20.93,
        94.8
      ]
    },
    {
      "name": "legR_shin",
      "parent": "legR_thigh",
      "rest": 112.16,
      "attach": [
        163.38,
        -0.0
      ]
    },
    {
      "name": "legR_foot",
      "parent": "legR_shin",
      "rest": 40.6,
      "attach": [
        180.31,
        -0.01
      ]
    },
    {
      "name": "legL_thigh",
      "parent": "body",
      "rest": 105.75,
      "attach": [
        -40.46,
        -53.04
      ]
    },
    {
      "name": "legL_shin",
      "parent": "legL_thigh",
      "rest": 120.13,
      "attach": [
        202.61,
        0.0
      ]
    },
    {
      "name": "legL_foot",
      "parent": "legL_shin",
      "rest": 81.71,
      "attach": [
        129.5,
        -0.0
      ]
    }
  ],
  "drawOrder": [
    "tail",
    "legL_shin",
    "legL_foot",
    "legR_thigh",
    "legR_shin",
    "legR_foot",
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
        0.7025,
        0.8724
      ],
      "file": "head.png"
    },
    {
      "name": "armR_lo",
      "pivot": [
        0.1314,
        0.9181
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
        0.0818
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
        0.9555,
        0.2684
      ],
      "file": "tail.png"
    },
    {
      "name": "legR_thigh",
      "pivot": [
        0.0884,
        -0.0242
      ],
      "file": "legR_thigh.png"
    },
    {
      "name": "legR_shin",
      "pivot": [
        0.85,
        0.1862
      ],
      "file": "legR_shin.png"
    },
    {
      "name": "legR_foot",
      "pivot": [
        0.2613,
        0.2115
      ],
      "file": "legR_foot.png"
    },
    {
      "name": "legL_shin",
      "pivot": [
        0.6122,
        0.2366
      ],
      "file": "legL_shin.png"
    },
    {
      "name": "legL_foot",
      "pivot": [
        0.5046,
        0.0723
      ],
      "file": "legL_foot.png"
    },
    {
      "name": "body",
      "pivot": [
        0.6085,
        0.5334
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
    "walk": {
      "fps": 14,
      "loop": true,
      "frames": [
        {
          "root": [
            -10,
            -445.0
          ],
          "angles": {
            "body": -65.7,
            "head": -95.1,
            "armR_up": 62.48,
            "armR_lo": -54.52,
            "armL_up": 118.16,
            "armL_lo": 109.55,
            "tail": 163.39,
            "legR_thigh": 40.52,
            "legR_shin": 125.46,
            "legR_foot": 40.6,
            "legL_thigh": 82.97,
            "legL_shin": 155.56,
            "legL_foot": 81.71
          }
        },
        {
          "root": [
            -10,
            -443.54
          ],
          "angles": {
            "body": -66.15,
            "head": -95.59,
            "armR_up": 62.71,
            "armR_lo": -53.87,
            "armL_up": 118.62,
            "armL_lo": 111.55,
            "tail": 161.09,
            "legR_thigh": 43.46,
            "legR_shin": 129.93,
            "legR_foot": 40.6,
            "legL_thigh": 87.11,
            "legL_shin": 157.93,
            "legL_foot": 81.71
          }
        },
        {
          "root": [
            -10,
            -440.0
          ],
          "angles": {
            "body": -66.53,
            "head": -96.3,
            "armR_up": 63.36,
            "armR_lo": -52.89,
            "armL_up": 119.92,
            "armL_lo": 114.32,
            "tail": 158.41,
            "legR_thigh": 46.23,
            "legR_shin": 134.72,
            "legR_foot": 40.6,
            "legL_thigh": 89.38,
            "legL_shin": 165.54,
            "legL_foot": 78.98
          }
        },
        {
          "root": [
            -10,
            -436.46
          ],
          "angles": {
            "body": -66.78,
            "head": -97.15,
            "armR_up": 64.33,
            "armR_lo": -51.74,
            "armL_up": 121.86,
            "armL_lo": 117.43,
            "tail": 155.74,
            "legR_thigh": 49.37,
            "legR_shin": 139.41,
            "legR_foot": 40.6,
            "legL_thigh": 86.67,
            "legL_shin": 177.35,
            "legL_foot": 72.83
          }
        },
        {
          "root": [
            -10,
            -435.0
          ],
          "angles": {
            "body": -66.86,
            "head": -97.99,
            "armR_up": 65.48,
            "armR_lo": -50.59,
            "armL_up": 124.16,
            "armL_lo": 120.41,
            "tail": 153.49,
            "legR_thigh": 53.27,
            "legR_shin": 143.45,
            "legR_foot": 40.6,
            "legL_thigh": 79.79,
            "legL_shin": -177.74,
            "legL_foot": 68.78
          }
        },
        {
          "root": [
            -10,
            -436.46
          ],
          "angles": {
            "body": -66.75,
            "head": -98.7,
            "armR_up": 66.63,
            "armR_lo": -49.62,
            "armL_up": 126.46,
            "armL_lo": 122.8,
            "tail": 152.0,
            "legR_thigh": 57.95,
            "legR_shin": 146.52,
            "legR_foot": 40.6,
            "legL_thigh": 69.05,
            "legL_shin": 177.02,
            "legL_foot": 67.78
          }
        },
        {
          "root": [
            -10,
            -440.0
          ],
          "angles": {
            "body": -66.48,
            "head": -99.17,
            "armR_up": 67.6,
            "armR_lo": -48.98,
            "armL_up": 128.4,
            "armL_lo": 124.25,
            "tail": 151.51,
            "legR_thigh": 63.11,
            "legR_shin": 148.7,
            "legR_foot": 40.6,
            "legL_thigh": 58.21,
            "legL_shin": 162.07,
            "legL_foot": 70.07
          }
        },
        {
          "root": [
            -10,
            -443.54
          ],
          "angles": {
            "body": -66.09,
            "head": -99.33,
            "armR_up": 68.25,
            "armR_lo": -48.76,
            "armL_up": 129.7,
            "armL_lo": 124.52,
            "tail": 152.08,
            "legR_thigh": 68.33,
            "legR_shin": 150.51,
            "legR_foot": 40.6,
            "legL_thigh": 52.79,
            "legL_shin": 143.57,
            "legL_foot": 75.11
          }
        },
        {
          "root": [
            -10,
            -445.0
          ],
          "angles": {
            "body": -65.62,
            "head": -99.16,
            "armR_up": 68.48,
            "armR_lo": -49.0,
            "armL_up": 130.16,
            "armL_lo": 123.59,
            "tail": 153.63,
            "legR_thigh": 73.3,
            "legR_shin": 152.54,
            "legR_foot": 40.6,
            "legL_thigh": 54.43,
            "legL_shin": 127.17,
            "legL_foot": 81.71
          }
        },
        {
          "root": [
            -10,
            -443.54
          ],
          "angles": {
            "body": -65.17,
            "head": -98.67,
            "armR_up": 68.25,
            "armR_lo": -49.65,
            "armL_up": 129.7,
            "armL_lo": 121.59,
            "tail": 155.93,
            "legR_thigh": 77.97,
            "legR_shin": 155.08,
            "legR_foot": 40.6,
            "legL_thigh": 56.95,
            "legL_shin": 132.43,
            "legL_foot": 81.71
          }
        },
        {
          "root": [
            -10,
            -440.0
          ],
          "angles": {
            "body": -64.79,
            "head": -97.96,
            "armR_up": 67.6,
            "armR_lo": -50.63,
            "armL_up": 128.4,
            "armL_lo": 118.82,
            "tail": 158.61,
            "legR_thigh": 80.43,
            "legR_shin": 159.67,
            "legR_foot": 37.87,
            "legL_thigh": 59.38,
            "legL_shin": 138.22,
            "legL_foot": 81.71
          }
        },
        {
          "root": [
            -10,
            -436.46
          ],
          "angles": {
            "body": -64.54,
            "head": -97.11,
            "armR_up": 66.63,
            "armR_lo": -51.78,
            "armL_up": 126.46,
            "armL_lo": 115.71,
            "tail": 161.28,
            "legR_thigh": 75.81,
            "legR_shin": 164.56,
            "legR_foot": 31.72,
            "legL_thigh": 62.17,
            "legL_shin": 143.76,
            "legL_foot": 81.71
          }
        },
        {
          "root": [
            -10,
            -435.0
          ],
          "angles": {
            "body": -64.46,
            "head": -96.27,
            "armR_up": 65.48,
            "armR_lo": -52.93,
            "armL_up": 124.16,
            "armL_lo": 112.73,
            "tail": 163.53,
            "legR_thigh": 66.17,
            "legR_shin": 164.22,
            "legR_foot": 27.67,
            "legL_thigh": 65.61,
            "legL_shin": 148.24,
            "legL_foot": 81.71
          }
        },
        {
          "root": [
            -10,
            -436.46
          ],
          "angles": {
            "body": -64.57,
            "head": -95.56,
            "armR_up": 64.33,
            "armR_lo": -53.9,
            "armL_up": 121.86,
            "armL_lo": 110.34,
            "tail": 165.02,
            "legR_thigh": 54.01,
            "legR_shin": 157.34,
            "legR_foot": 26.67,
            "legL_thigh": 69.66,
            "legL_shin": 151.19,
            "legL_foot": 81.71
          }
        },
        {
          "root": [
            -10,
            -440.0
          ],
          "angles": {
            "body": -64.84,
            "head": -95.09,
            "armR_up": 63.36,
            "armR_lo": -54.54,
            "armL_up": 119.92,
            "armL_lo": 108.89,
            "tail": 165.51,
            "legR_thigh": 43.9,
            "legR_shin": 145.84,
            "legR_foot": 28.96,
            "legL_thigh": 74.09,
            "legL_shin": 152.85,
            "legL_foot": 81.71
          }
        },
        {
          "root": [
            -10,
            -443.54
          ],
          "angles": {
            "body": -65.23,
            "head": -94.93,
            "armR_up": 62.71,
            "armR_lo": -54.76,
            "armL_up": 118.62,
            "armL_lo": 108.62,
            "tail": 164.94,
            "legR_thigh": 39.44,
            "legR_shin": 134.1,
            "legR_foot": 34.0,
            "legL_thigh": 78.61,
            "legL_shin": 154.01,
            "legL_foot": 81.71
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
            "tail": 158.51,
            "legR_thigh": 46.24,
            "legR_shin": 112.16,
            "legR_foot": 40.6,
            "legL_thigh": 105.75,
            "legL_shin": 120.13,
            "legL_foot": 81.71
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
            "tail": 152.15,
            "legR_thigh": 46.24,
            "legR_shin": 112.16,
            "legR_foot": 40.6,
            "legL_thigh": 105.75,
            "legL_shin": 120.13,
            "legL_foot": 81.71
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
            "tail": 148.8,
            "legR_thigh": 46.24,
            "legR_shin": 112.16,
            "legR_foot": 40.6,
            "legL_thigh": 105.75,
            "legL_shin": 120.13,
            "legL_foot": 81.71
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
            "tail": 146.59,
            "legR_thigh": 46.24,
            "legR_shin": 112.16,
            "legR_foot": 40.6,
            "legL_thigh": 105.75,
            "legL_shin": 120.13,
            "legL_foot": 81.71
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
            "tail": 145.24,
            "legR_thigh": 46.24,
            "legR_shin": 112.16,
            "legR_foot": 40.6,
            "legL_thigh": 105.75,
            "legL_shin": 120.13,
            "legL_foot": 81.71
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
            "tail": 144.6,
            "legR_thigh": 46.24,
            "legR_shin": 112.16,
            "legR_foot": 40.6,
            "legL_thigh": 105.75,
            "legL_shin": 120.13,
            "legL_foot": 81.71
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
            "tail": 144.56,
            "legR_thigh": 46.24,
            "legR_shin": 112.16,
            "legR_foot": 40.6,
            "legL_thigh": 105.75,
            "legL_shin": 120.13,
            "legL_foot": 81.71
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
            "tail": 145.02,
            "legR_thigh": 46.24,
            "legR_shin": 112.16,
            "legR_foot": 40.6,
            "legL_thigh": 105.75,
            "legL_shin": 120.13,
            "legL_foot": 81.71
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
            "tail": 145.92,
            "legR_thigh": 46.24,
            "legR_shin": 112.16,
            "legR_foot": 40.6,
            "legL_thigh": 105.75,
            "legL_shin": 120.13,
            "legL_foot": 81.71
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
            "tail": 147.17,
            "legR_thigh": 46.24,
            "legR_shin": 112.16,
            "legR_foot": 40.6,
            "legL_thigh": 105.75,
            "legL_shin": 120.13,
            "legL_foot": 81.71
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
            "tail": 148.7,
            "legR_thigh": 46.24,
            "legR_shin": 112.16,
            "legR_foot": 40.6,
            "legL_thigh": 105.75,
            "legL_shin": 120.13,
            "legL_foot": 81.71
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
            "tail": 150.45,
            "legR_thigh": 46.24,
            "legR_shin": 112.16,
            "legR_foot": 40.6,
            "legL_thigh": 105.75,
            "legL_shin": 120.13,
            "legL_foot": 81.71
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
            "tail": 152.37,
            "legR_thigh": 46.24,
            "legR_shin": 112.16,
            "legR_foot": 40.6,
            "legL_thigh": 105.75,
            "legL_shin": 120.13,
            "legL_foot": 81.71
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
            "tail": 154.38,
            "legR_thigh": 46.24,
            "legR_shin": 112.16,
            "legR_foot": 40.6,
            "legL_thigh": 105.75,
            "legL_shin": 120.13,
            "legL_foot": 81.71
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
            "tail": 156.44,
            "legR_thigh": 46.24,
            "legR_shin": 112.16,
            "legR_foot": 40.6,
            "legL_thigh": 105.75,
            "legL_shin": 120.13,
            "legL_foot": 81.71
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
            "tail": 158.51,
            "legR_thigh": 46.24,
            "legR_shin": 112.16,
            "legR_foot": 40.6,
            "legL_thigh": 105.75,
            "legL_shin": 120.13,
            "legL_foot": 81.71
          }
        }
      ]
    }
  }
}
