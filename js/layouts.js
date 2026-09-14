const LAYOUTS = {
    getLeftSlots: (photos) => {
        const slots = [];
        photos.forEach(photo => slots.push(photo, photo));
        return slots;
    },
    getRightSlots: (photos) => photos
};