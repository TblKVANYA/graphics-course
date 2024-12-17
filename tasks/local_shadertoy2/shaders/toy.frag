#version 450

layout(location = 0) out vec4 fragColor;

layout(binding = 0) uniform sampler2D emp;
layout(binding = 1) uniform sampler2D iChannel0;


layout(push_constant) uniform pushed_params 
{
  uint resolution_x;
  uint resolution_y;
  float time;
  float mouse_x;
  float mouse_y;
} pushed_params_t;


float iTime;
vec2 iResolution;
vec2 iMouse;



#define MAX_STEPS 300
#define MAX_DIST 50.0
#define EPS 0.001
#define SMOOTH_FACTOR 0.03
#define FRAME_LENGTH 0.075
#define DELAY_TIME 3.0

mat3 rotateY(float al, out mat3 reverse) 
{
    float c = cos(al);
    float s = sin(al);
    reverse = mat3(
        vec3( c,0,-s),
        vec3( 0,1, 0),
        vec3( s,0, c)
    );
    return mat3(
        vec3( c,0,s),
        vec3( 0,1,0),
        vec3(-s,0,c)
    );
}


float sMin(float a, float b, float k, out float mixC)
{
    // cubic polynomial
    k *= 6.0;
    float h = max( k-abs(a-b), 0.0 )/k;
    float m = h*h*h*0.5;
    float s = m*k*(1.0/3.0);
    if (a < b) {
        mixC = m;
        return a - s;
    }
    mixC = 1.0 - m;
    return b - s;
}


float sdBoxFrame(vec3 pos, vec3 b, float e ) 
{
       pos = abs(pos  )-b;
  vec3 q = abs(pos+e)-e;
  return min(min(
      length(max(vec3(pos.x,q.y,  q.z),0.0))+  min(max(pos.x,max(q.y,  q.z)),  0.0),
      length(max(vec3(q.x,  pos.y,q.z),0.0))+  min(max(q.x,  max(pos.y,q.z)),  0.0)),
      length(max(vec3(q.x,  q.y,  pos.z),0.0))+min(max(q.x  ,max(q.y,  pos.z)),0.0));
}

float sdPlane(vec3 p) 
{
    return p.y;
}



float buildScene(vec3 p, float time, mat3 m, 
 out vec3 offset, out float mixC) 
{
     p = m * p;
    float distPlane = sdPlane(p);
    

    if (time >= DELAY_TIME) 
    {
        time -= DELAY_TIME;
        offset = vec3(0, 1.0 + 1.5 * sin(time), 0);
    } else 
    {
        offset = vec3((DELAY_TIME-time) * 2.0, 0.7, 0);
    }
    float distBoxFrame = sdBoxFrame(p - offset, vec3(0.5, 0.7, 0.4), FRAME_LENGTH);
    return sMin(distPlane, distBoxFrame, SMOOTH_FACTOR, mixC);
}



float trace(vec3 from, vec3 dir, float time, out bool hit, in mat3 m, 
out vec3 offset, out float mixC) 
{
    hit = false;
    float distPlane = 0.0;
    float distBoxFrame = 0.0;
    
    float dist = 0.0;
    for (int i = 0; i < MAX_STEPS; ++i) 
    {
        vec3 p = from + dir * dist;
        float d = buildScene(p, time, m, offset, mixC);
        if (d < EPS )
        {
            hit = true; 
            return dist;
        }
        
        dist += d;
        if (dist > MAX_DIST)
        {
            break;
        }
    }
    
    return MAX_DIST;
}


vec3 generateNormal(vec3 p, float time, mat3 m) 
{
    float e = EPS;
    
    float tmp2;
    vec3 tmp1;
    
    float dx1 = buildScene(p + vec3(e, 0, 0), time, m, tmp1, tmp2);
    float dx2 = buildScene(p - vec3(e, 0, 0), time, m, tmp1, tmp2);
    float dy1 = buildScene(p + vec3(0, e, 0), time, m, tmp1, tmp2);
    float dy2 = buildScene(p - vec3(0, e, 0), time, m, tmp1, tmp2);
    float dz1 = buildScene(p + vec3(0, 0, e), time, m, tmp1, tmp2);
    float dz2 = buildScene(p - vec3(0, 0, e), time, m, tmp1, tmp2);
    
    return normalize(vec3(dx1 - dx2, dy1 - dy2, dz1 - dz2));
}

vec3 triplanar(vec3 p, vec3 offset, vec3 n) 
{
    p -= offset;
    vec3 b = max((abs(n) - 0.1) * 2.0, 0.0);
    b /= b.x + b.y + b.z;

    vec3 x = texture(iChannel0, p.yz * 0.9).rgb;
    vec3 y = texture(iChannel0, p.xz * 0.9).rgb;
    vec3 z = texture(iChannel0, p.xy * 0.9).rgb;

    return x * b.x + y * b.y + z * b.z;
}

vec3 myTexture(vec3 p) 
{
    if (abs(p.x) < 2.5 && abs(p.z) < 2.5) 
    {
        return vec3(1.0,  0.7, 0.3);
    }
    float tmp = 0.0;
    float xC = modf(p.x*4.0, tmp);
    float zC = modf(p.z*4.0, tmp);
    bool xF = (abs(xC) > 0.5);
    bool zF = (abs(zC) > 0.5);
    if (xF || zF) 
    {
        if (xF && zF) 
        {
            return vec3(0.0);
        }
        return vec3(1.0,  0.7, 0.3);
    }
    return vec3(1.0);
}

void mainImage( out vec4 fragColor, in vec2 fragCoord) 
{
    vec3 color = vec3(0.0);
    bool hit;
    
    float time = iTime;
    
    vec3 mouse = vec3(iMouse.xy/iResolution.xy - 0.5, 0.0);
    mat3 reverse;
    mat3 m = rotateY(6.0 * mouse.x, reverse);
    
    vec2 uv = (fragCoord - iResolution.xy * 0.5) / iResolution.y;
    uv.y = -uv.y;
    vec3 light = vec3(-1.0, 3.0, 1.0);
    vec3 eye = vec3(0.0, 2.2, 6.0);
    vec3 dir = normalize(vec3(uv, -1.0));
    
    float mixC = 0.0;
    vec3 offset;
    float dist = trace(eye, dir, time, hit, m, offset, mixC);
    if (hit) 
    {
        vec3 p = eye + dir * dist;
        vec3 n = generateNormal(p, time, m);
        vec3 l = normalize(light - p);
        float nl = max(0.0, dot(l, n));
        
        vec3 v = normalize(eye - p);
        vec3 h = normalize(v + l);
        float sp = pow(max(0.0, dot(n, h)), 50.0);
        
        vec3 planeColor = vec3(myTexture(p * reverse));
        vec3 boxColor   = vec3(triplanar(p, offset, n));
        
        vec3 colorW;
        
        colorW = mix(planeColor, boxColor, mixC);
        
        color = (0.5 * nl + 0.5 * sp) * colorW;
    } else 
    {
        color = vec3(0.1);
    }
    fragColor = vec4(color, 1.0);
}

void main( )
{
  ivec2 fragCoord = ivec2(gl_FragCoord.xy);

  iResolution = vec2(pushed_params_t.resolution_x, pushed_params_t.resolution_y);
  iTime = pushed_params_t.time;
  iMouse = vec2(pushed_params_t.mouse_x, pushed_params_t.mouse_y);

  mainImage(fragColor, fragCoord);
}
