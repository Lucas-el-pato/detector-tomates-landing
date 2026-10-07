# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: static HTML/CSS/JS with Three.js loaded from a CDN (ES module import map). No build step, so it deploys directly to GitHub Pages from the repo `Lucas-el-pato/detector-tomates-landing`.

## Users

Professors and evaluators of the Artificial Intelligence course (9th semester, Facultad de Ingeniería, Universidad Nacional de Asunción — FIUNA). They open the page to understand the project during evaluation: the problem, the method, and the results, typically on a laptop, sometimes projected in class.

## Product Purpose

Present a computer-vision tomato detector that identifies tomatoes on the plant (en la mata, not on a packing line) using two cameras with stereoscopic vision: it detects each tomato, classifies its ripeness, and triangulates its 3D position (depth from disparity) to guide harvesting. Success means an evaluator understands in seconds what the system does, how it was built (data → model → training → evaluation), and how well it performs.

## Positioning

A student project; its value is clarity of method and honest evaluation, not commercial claims.

## Capabilities and Constraints

- Confirmed by the user: works on tomatoes on the plant, with a stereo pair of two cameras (stereoscopic vision) to identify and localize them.
- Detects tomatoes (bounding boxes) in both views, classifies ripeness, matches detections across views and triangulates depth (Z = f·B/d).
- Inferred/illustrative (not confirmed by the user): object detector of the YOLO family, ripeness classes such as verde / pintón / maduro / dañado.
- Static site only; no backend.

## Evidence on Hand

None yet. All metrics, dataset numbers, team names, and charts are synthetic demonstration content and must be visibly labeled as illustrative and listed for replacement. Do not present them as real results.

## Product Principles

1. Explain the pipeline end to end; an evaluator should be able to follow the method.
2. Show, don't claim: demonstrate detection visually.
3. Honest evaluation: show per-class metrics and failure modes, not only the best number.
4. Synthetic data is always labeled until replaced.
