# BackSilence — HUD Layout Boards & Viewport Restraint Verification

> Measured spatial bounding boxes, vertical stack composition, and non-overlapping clearance verification across key viewports.
> Viewports evaluated: 390×844 (Mobile Portrait), 1440×900 (Laptop Display), and 1080×1920 (9:16 Portrait Streamer Mode).

---

## 1. Viewport Board 1: 390×844 (Mobile Portrait / iPhone 12/13/14)

### Spatial Geometry & Stack Metrics
- **Viewport Dimensions:** $390\text{ px} \times 844\text{ px}$ (Aspect Ratio: ~9:19.5)
- **Bottom Anchor Margin:** $16\text{ px}$ (`env(safe-area-inset-bottom, 16px)`)
- **Vertical Stack Gap:** $8\text{ px}$ (`flex-direction: column-reverse`)

| Element ID | Role | Position $[x_1, y_1 \to x_2, y_2]$ | Dimensions $[w \times h]$ | Clearance to Neighbor |
|---|---|---|---|---|
| `#hud-noise-minimal` | Acoustic Noise Line | $[40, 810 \to 350, 828]$ | $310 \times 18\text{ px}$ | $16\text{ px}$ from bottom edge |
| `#hud-objective-pill` | Objective Line Pill | $[19, 776 \to 371, 802]$ | $351 \times 26\text{ px}$ | $8\text{ px}$ above noise meter |
| `#hud-quiet-hint` | Quiet In-World Hint | $[29, 746 \to 361, 768]$ | $332 \times 22\text{ px}$ | $8\text{ px}$ above objective pill |
| `#hud-prompt` | Center Interaction Prompt | $[65, 464 \to 325, 500]$ | $260 \times 36\text{ px}$ | $246\text{ px}$ above bottom stack |

### ASCII Layout Wireframe (390×844)
```text
+---------------------------------------+  y = 0
|                                       |
|                                       |
|                                       |
|                                       |
|                   +                   |  y = 422 (Screen Center)
|       [ HOLD [E] TO CRANK ]           |  y = 464-500 (#hud-prompt)
|                                       |
|                                       |
|         "WATER IS LOUD."              |  y = 746-768 (#hud-quiet-hint)
|    (Find the numbered pillars.)       |  y = 776-802 (#hud-objective-pill)
|    [=====-------------] RADIUS ~0m    |  y = 810-828 (#hud-noise-minimal)
+---------------------------------------+  y = 844
```

---

## 2. Viewport Board 2: 1440×900 (Laptop Display 16:10)

### Spatial Geometry & Stack Metrics
- **Viewport Dimensions:** $1440\text{ px} \times 900\text{ px}$ (Aspect Ratio: 16:10)
- **Bottom Anchor Margin:** $16\text{ px}$
- **Vertical Stack Gap:** $8\text{ px}$

| Element ID | Role | Position $[x_1, y_1 \to x_2, y_2]$ | Dimensions $[w \times h]$ | Clearance to Neighbor |
|---|---|---|---|---|
| `#hud-noise-minimal` | Acoustic Noise Line | $[565, 866 \to 875, 884]$ | $310 \times 18\text{ px}$ | $16\text{ px}$ from bottom edge |
| `#hud-objective-pill` | Objective Line Pill | $[500, 832 \to 940, 858]$ | $440 \times 26\text{ px}$ | $8\text{ px}$ above noise meter |
| `#hud-quiet-hint` | Quiet In-World Hint | $[550, 802 \to 890, 824]$ | $340 \times 22\text{ px}$ | $8\text{ px}$ above objective pill |
| `#hud-prompt` | Center Interaction Prompt | $[590, 495 \to 850, 531]$ | $260 \times 36\text{ px}$ | $271\text{ px}$ above bottom stack |

### ASCII Layout Wireframe (1440×900)
```text
+-------------------------------------------------------------------------------+  y = 0
|                                                                               |
|                                                                               |
|                                                                               |
|                                       +                                       |  y = 450
|                             [ HOLD [E] TO CRANK ]                             |  y = 495-531
|                                                                               |
|                                                                               |
|                               "WATER IS LOUD."                                |  y = 802-824
|                         (Find the numbered pillars.)                          |  y = 832-858
|                         [=====-------------] RADIUS ~0m                       |  y = 866-884
+-------------------------------------------------------------------------------+  y = 900
```

---

## 3. Viewport Board 3: 1080×1920 (9:16 Portrait Streamer Mode)

### Spatial Geometry & Stack Metrics
- **Viewport Dimensions:** $1080\text{ px} \times 1920\text{ px}$ (Aspect Ratio: 9:16)
- **Top Facecam Obstruction Zone:** $0\text{ px} \to 538\text{ px}$ (Top 28% height)
- **Timer Position:** $y = 550\text{ px}$ (`top: calc(28% + 12px)`)
- **Bottom Anchor Margin:** $16\text{ px}$
- **Vertical Stack Gap:** $8\text{ px}$

| Element ID | Role | Position $[x_1, y_1 \to x_2, y_2]$ | Dimensions $[w \times h]$ | Clearance to Neighbor |
|---|---|---|---|---|
| `#debug-facecam-overlay` | Streamer Camera Zone | $[0, 0 \to 1080, 538]$ | $1080 \times 538\text{ px}$ | Occupies top 28% frame |
| `#hud-run-timer` | Run Stopwatch Timer | $[480, 550 \to 600, 578]$ | $120 \times 28\text{ px}$ | $12\text{ px}$ below facecam boundary |
| `#hud-prompt` | Center Interaction Prompt | $[410, 1056 \to 670, 1092]$ | $260 \times 36\text{ px}$ | $478\text{ px}$ below timer |
| `#hud-quiet-hint` | Quiet In-World Hint | $[370, 1822 \to 710, 1844]$ | $340 \times 22\text{ px}$ | $730\text{ px}$ below center prompt |
| `#hud-objective-pill` | Objective Line Pill | $[320, 1852 \to 760, 1878]$ | $440 \times 26\text{ px}$ | $8\text{ px}$ above noise meter |
| `#hud-noise-minimal` | Acoustic Noise Line | $[385, 1886 \to 695, 1904]$ | $310 \times 18\text{ px}$ | $16\text{ px}$ from bottom edge |

### ASCII Layout Wireframe (1080×1920)
```text
+---------------------------------------+  y = 0
| [ FACECAM LIVE STREAM ZONE - 28% ]    |
|                                       |
|                                       |
|~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~|  y = 538 (Facecam Lower Edge)
|              [ 04:12.3 ]              |  y = 550-578 (#hud-run-timer)
|                                       |
|                                       |
|                                       |
|                   +                   |  y = 960 (Screen Center)
|         [ [E] BOARD AIRLOCK ]         |  y = 1056-1092 (#hud-prompt)
|                                       |
|                                       |
|                                       |
|                                       |
|                                       |
|           "WATER IS LOUD."            |  y = 1822-1844 (#hud-quiet-hint)
|     (Find the numbered pillars.)      |  y = 1852-1878 (#hud-objective-pill)
|     [=====-------------] RADIUS ~0m   |  y = 1886-1904 (#hud-noise-minimal)
+---------------------------------------+  y = 1920
```

---

## 4. Bounding Box Non-Intersection Verification

As verified by `tests/hud-layout.test.ts`, all pairs of visible HUD elements $(A, B)$ satisfy the strict separation theorem across all tested viewports:
$$\text{Separated}(A, B) \iff (A_{right} \le B_{left}) \lor (B_{right} \le A_{left}) \lor (A_{bottom} \le B_{top}) \lor (B_{bottom} \le A_{top})$$

Total collisions detected across 20 layout configurations: **0**.

