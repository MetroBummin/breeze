#!/usr/bin/env python3
"""Trace approved Dark01 pixels; preserve geometry, remove raster texture.

Requires Pillow and numpy. No font substitution or anisotropic scaling.
The wordmark and br contours both come from the approved Library board.
"""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'docs/brand/approved-dark01.png'


def simplify(points, tolerance=1.15):
    if len(points) < 3:
        return points
    a, b = np.array(points[0]), np.array(points[-1])
    v = b-a
    distances = [np.linalg.norm(np.array(p)-a) if not np.dot(v,v) else
                 abs(v[0]*(p[1]-a[1])-v[1]*(p[0]-a[0]))/np.linalg.norm(v) for p in points]
    i = int(np.argmax(distances))
    if distances[i] <= tolerance:
        return [points[0], points[-1]]
    return simplify(points[:i+1], tolerance)[:-1] + simplify(points[i:], tolerance)


def outline(bounds):
    pixels = np.array(Image.open(SOURCE).convert('RGB'))
    x0,y0,x1,y1 = bounds
    pixels = pixels[y0:y1,x0:x1]
    mask = (np.min(pixels, axis=2) > 110) & (np.ptp(pixels.astype(int), axis=2) > 12)
    # Bright sea-glass ink is separated from the dark approved board.
    edges = {}
    height,width = mask.shape
    for y,x in zip(*np.where(mask)):
        if y == 0 or not mask[y-1,x]: edges[(x,y)] = (x+1,y)
        if x == width-1 or not mask[y,x+1]: edges[(x+1,y)] = (x+1,y+1)
        if y == height-1 or not mask[y+1,x]: edges[(x+1,y+1)] = (x,y+1)
        if x == 0 or not mask[y,x-1]: edges[(x,y+1)] = (x,y)
    contours = []
    while edges:
        start = next(iter(edges)); points = [start]; point = start
        while point in edges:
            point = edges.pop(point); points.append(point)
            if point == start: break
        if len(points)>30: contours.append(simplify(points))
    allpoints = [p for loop in contours for p in loop]
    left,top = map(min,zip(*allpoints)); right,bottom = map(max,zip(*allpoints))
    paths=[]
    for points in contours:
        points=[(x-left,y-top) for x,y in points[:-1]]
        # Midpoint quadratic joins remove pixel stair steps with subpixel error.
        previous=points[-1]; first=points[0]
        parts=[f'M{(previous[0]+first[0])/2:g},{(previous[1]+first[1])/2:g}']
        for i,p in enumerate(points):
            q=points[(i+1)%len(points)]
            parts.append(f'Q{p[0]:g},{p[1]:g} {(p[0]+q[0])/2:g},{(p[1]+q[1])/2:g}')
        paths.append(' '.join(parts)+'Z')
    return right-left,bottom-top,' '.join(paths)


def svg(width,height,path,dark=False,icon=False):
    # 08:15 confirms original cursive r; 08:48 selects WHITE palette B.
    # Dark01 and br icon ink remain unchanged.
    colors=('#acece1','#a9d4ee') if dark or icon else ('#63acb5','#699bbc')
    gradient=f'<stop stop-color="{colors[0]}"/><stop offset="{1 if dark or icon else .8}" stop-color="{colors[1]}"/>'
    if not dark and not icon: gradient+=f'<stop offset="1" stop-color="{colors[1]}"/>'
    if icon:
        scale=820/max(width,height); x=(1024-width*scale)/2; y=(1024-height*scale)/2
        geometry=f'<rect width="1024" height="1024" rx="220" fill="#20211e"/><g transform="translate({x:g} {y:g}) scale({scale:g})"><path d="{path}" fill="url(#ink)" fill-rule="evenodd"/></g>'
        width=height=1024
    else: geometry=f'<path d="{path}" fill="url(#ink)" fill-rule="evenodd"/>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}"><defs><linearGradient id="ink">{gradient}</linearGradient></defs>{geometry}</svg>\n'


if __name__=='__main__':
    word=outline((90,110,970,430))
    monogram=outline((52,1110,315,1340))
    for name,data in [('wordmark-light.svg',svg(*word)),('wordmark-dark.svg',svg(*word,dark=True)),('monogram.svg',svg(*monogram,icon=True))]:
        (ROOT/'assets/brand'/name).write_text(data)
    width,height,path=word
    (ROOT/'assets/brand/wordmark-mask.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}"><path d="{path}" fill="black" fill-rule="evenodd"/></svg>\n')
