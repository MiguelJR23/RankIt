let db=JSON.parse(localStorage.getItem("rankit-v2"))||{
    title:"Meu Ranking",
    items:[]
};

let editing=null;

const ranking=document.getElementById("ranking");
const unranked=document.getElementById("unranked");
const modal=document.getElementById("modal");

document.getElementById("titleInput").value=db.title;

function save(){
    db.title=document.getElementById("titleInput").value;
    localStorage.setItem("rankit-v2",JSON.stringify(db));
}

function normalize(){
    db.items
    .filter(i=>i.rank!==null)
    .sort((a,b)=>a.rank-b.rank)
    .forEach((i,n)=>i.rank=n+1);
}

function updateStats(){
    document.getElementById("totalItems").textContent=db.items.length+" itens";
    document.getElementById("reviewCount").textContent=db.items.filter(i=>i.review).length+" revisão";
    document.getElementById("unrankedCount").textContent=db.items.filter(i=>i.rank===null).length+" não ranqueados";
}

function placeholder(nome){
    return "https://placehold.co/400x600/111/666?text="+encodeURIComponent(nome);
}

function render(){
    normalize();
    save();
    updateStats();
    ranking.innerHTML="";
    unranked.innerHTML="";

const search=document.getElementById("search").value.toLowerCase();
const filter=document.getElementById("filter").value;

db.items
.filter(i=>i.name.toLowerCase().includes(search))
.filter(i=>{

if(filter==="ranked")return i.rank!==null;
if(filter==="unranked")return i.rank===null;
if(filter==="review")return i.review;
return true;
})

.sort((a,b)=>(a.rank??9999)-(b.rank??9999))
.forEach(i=>{

const card=document.createElement("div");
card.className="card";
card.draggable=i.rank!==null;
card.dataset.id=i.id;
card.innerHTML=`

<img src="${i.image||placeholder(i.name)}">
<div class="info">
<div class="rank">${i.rank?i.rank+".":"—"} ${i.name}</div>

${i.review?'<div class="review">★ A revisar</div>':""}
${i.note?`<div class="note">${i.note}</div>`:""}

<div class="actions">
<button onclick="editItem(${i.id})">✏</button>
<button onclick="deleteItem(${i.id})">🗑</button>
</div>
</div>
`;

card.addEventListener("dragstart",()=>card.classList.add("dragging"));

card.addEventListener("dragend",()=>{

card.classList.remove("dragging");

rebuildRanks();

});

(i.rank!==null?ranking:unranked).appendChild(card);

});

}

function openModal(item=null){

editing=item;

document.getElementById("modalTitle").textContent=item?"Editar":"Novo Item";

nameInput.value=item?.name||"";
imageInput.value=item?.image||"";
noteInput.value=item?.note||"";
rankInput.value=item?.rank||"";
reviewInput.checked=item?.review||false;

modal.classList.remove("hidden");

}

function saveItem(){

const name=nameInput.value.trim();

if(!name){

alert("Nome obrigatório.");

return;

}

if(editing){

editing.name=name;
editing.image=imageInput.value.trim();
editing.note=noteInput.value.trim();
editing.review=reviewInput.checked;
editing.rank=rankInput.value?Number(rankInput.value):null;

}else{

db.items.push({

id:Date.now(),

name,

image:imageInput.value.trim(),

note:noteInput.value.trim(),

review:reviewInput.checked,

rank:rankInput.value?Number(rankInput.value):null

});

}

modal.classList.add("hidden");

render();

}

function editItem(id){

openModal(db.items.find(i=>i.id===id));

}

function deleteItem(id){

db.items=db.items.filter(i=>i.id!==id);

render();

}

function rebuildRanks(){

[...ranking.children].forEach((card,index)=>{

db.items.find(i=>i.id==card.dataset.id).rank=index+1;

});

render();

}

ranking.addEventListener("dragover",e=>{

e.preventDefault();

const dragging=document.querySelector(".dragging");

const cards=[...ranking.querySelectorAll(".card:not(.dragging)")];

const next=cards.find(c=>e.clientY<c.getBoundingClientRect().top+c.offsetHeight/2);

next?ranking.insertBefore(dragging,next):ranking.appendChild(dragging);

});

titleInput.oninput=save;

search.oninput=render;

filter.onchange=render;

columns.onchange=e=>{

ranking.className=`grid cols-${e.target.value}`;

unranked.className=`grid cols-${e.target.value}`;

};

newBtn.onclick=()=>openModal();

cancelBtn.onclick=()=>modal.classList.add("hidden");

saveBtn.onclick=saveItem;

render();