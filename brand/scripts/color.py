import math, json
def s2l(c): return c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4
def l2s(c): return 12.92*c if c<=0.0031308 else 1.055*c**(1/2.4)-0.055
def hex2rgb(h): h=h.lstrip('#'); return [int(h[i:i+2],16)/255 for i in (0,2,4)]
def rgb2hex(c): return '#'+''.join(f'{round(max(0,min(1,x))*255):02X}' for x in c)
def rgb2oklab(c):
    r,g,b=[s2l(x) for x in c]
    l=0.4122214708*r+0.5363325363*g+0.0514459929*b
    m=0.2119034982*r+0.6806995451*g+0.1073969566*b
    s=0.0883024619*r+0.2817188376*g+0.6299787005*b
    l,m,s=[x**(1/3) for x in (l,m,s)]
    return (0.2104542553*l+0.7936177850*m-0.0040720468*s,1.9779984951*l-2.4285922050*m+0.4505937099*s,0.0259040371*l+0.7827717662*m-0.8086757660*s)
def oklab2rgb(L,a,b):
    l=(L+0.3963377774*a+0.2158037573*b)**3; m=(L-0.1055613458*a-0.0638541728*b)**3; s=(L-0.0894841775*a-1.2914855480*b)**3
    r=4.0767416621*l-3.3077115913*m+0.2309699292*s; g=-1.2684380046*l+2.6097574011*m-0.3413193965*s; bb=-0.0041960863*l-0.7034186147*m+1.7076147010*s
    return [r,g,bb]
def inGamut(c): return all(-1e-4<=x<=1+1e-4 for x in c)
def lch(h):
    L,a,b=rgb2oklab(hex2rgb(h)); return L,math.hypot(a,b),math.atan2(b,a)
def fromLCH(L,C,H):
    while C>0:
        lin=oklab2rgb(L,C*math.cos(H),C*math.sin(H))
        if inGamut(lin): break
        C-=0.002
    lin=oklab2rgb(L,max(C,0)*math.cos(H),max(C,0)*math.sin(H))
    return rgb2hex([l2s(max(0,min(1,x))) for x in lin])
def lum(h): r,g,b=[s2l(x) for x in hex2rgb(h)]; return 0.2126*r+0.7152*g+0.0722*b
def contrast(a,b):
    x,y=sorted([lum(a),lum(b)],reverse=True); return (x+0.05)/(y+0.05)
STEPS=[50,100,200,300,400,500,600,700,800,900,950]
def scale(h, chroma_cap=None):
    L0,C0,H=lch(h)
    Ls={50:.975,100:.948,200:.895,300:.82,400:.73,500:.635,600:L0,700:L0-.075,800:L0-.145,900:L0-.21,950:L0-.265}
    out={}
    for s in STEPS:
        L=Ls[s]; C=C0
        if s<=200: C=C0*{50:.12,100:.22,200:.42}[s]
        elif s==300: C=C0*.65
        elif s>=900: C=C0*.8
        if chroma_cap: C=min(C,chroma_cap)
        out[s]=h.upper() if s==600 else fromLCH(L,C,H)
    return out
