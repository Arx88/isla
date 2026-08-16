import io
p = 'web/index.html'
s = io.open(p, encoding='utf-8').read()
old = '<div class="cc-think hidden" id="ccThink"></div>\n      <div class="cc-needs" id="ccNeeds"></div>\n      <div class="cc-skills" id="ccSkills"></div>\n      <div class="cc-rels" id="ccRels"></div>\n      <div class="cc-mem" id="ccMem"></div>'
new = '''<div class="cc-subtitle" id="ccSubtitle"></div>
      <div class="cc-think hidden" id="ccThink"></div>
      <div class="cc-sec"><div class="cc-sec-t">Cuerpo</div><div class="cc-needs" id="ccNeeds"></div></div>
      <div class="cc-sec"><div class="cc-sec-t">Ánimo y emociones</div><div class="cc-skills" id="ccSkills"></div></div>
      <div class="cc-sec"><div class="cc-sec-t">Mochila</div><div class="cc-inv" id="ccInv"></div></div>
      <div class="cc-sec"><div class="cc-sec-t">Vínculos</div><div class="cc-rels" id="ccRels"></div></div>
      <div class="cc-sec"><div class="cc-sec-t">Últimas conversaciones</div><div class="cc-convos" id="ccConvos"></div></div>
      <div class="cc-sec"><div class="cc-sec-t">Su mapa de la isla</div><div class="cc-places" id="ccPlaces"></div></div>
      <div class="cc-sec"><div class="cc-sec-t">Pensamientos privados</div><div class="cc-thoughts" id="ccThoughts"></div></div>
      <div class="cc-sec"><div class="cc-sec-t">Recuerdos</div><div class="cc-mem" id="ccMem"></div></div>'''
assert old in s, 'no match en index.html'
s = s.replace(old, new, 1)
io.open(p, 'w', encoding='utf-8').write(s)
print('index.html: expediente completo agregado')
